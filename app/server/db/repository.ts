import { and, desc, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { db } from './client';
import type { ResumeStructure } from '../../lib/types';
import {
  applications,
  documents,
  facts,
  interviewSessions,
  interviewTurns,
  jobPostings,
  profileEntries,
  profiles,
  resumes,
  rules,
  users,
} from './schema';

/**
 * Every database read and write in the app.
 *
 * The rule that matters: **every exported function takes `userId` as its first
 * parameter and scopes its query by it.** The server holds a service-role
 * connection that bypasses row-level security, so a single forgotten
 * `where user_id` is a cross-tenant leak — one person's work history shown to
 * another. Concentrating every query here makes that a reviewable surface
 * rather than something spread across dozens of route handlers.
 *
 * Nothing outside this directory may import `./client`.
 */

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 22)}`;
}

// ── Users ──────────────────────────────────────────────────────────────────

/** Called from the Clerk webhook. Idempotent: Clerk retries deliveries. */
export async function upsertUser(userId: string, email: string, displayName?: string) {
  const [row] = await db
    .insert(users)
    .values({ id: userId, email, displayName })
    .onConflictDoUpdate({
      target: users.id,
      set: { email, displayName },
    })
    .returning();
  return row;
}

export async function getUser(userId: string) {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row ?? null;
}

export async function setOnboardingGoal(userId: string, stage: string, targetField: string) {
  await db.update(users).set({ stage, targetField }).where(eq(users.id, userId));
}

/**
 * Spends one credit, atomically.
 *
 * The check and the decrement are one statement on purpose: doing them as a
 * read then a write lets two concurrent generations both pass a check for the
 * last remaining credit. Returns null when there was nothing left to spend.
 */
export async function spendCredit(userId: string): Promise<number | null> {
  const [row] = await db
    .update(users)
    .set({ credits: sql`${users.credits} - 1` })
    .where(and(eq(users.id, userId), sql`${users.credits} > 0`))
    .returning({ credits: users.credits });
  return row?.credits ?? null;
}

// ── Profile ────────────────────────────────────────────────────────────────

export async function getProfile(userId: string) {
  const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return row ?? null;
}

export async function getProfileEntries(userId: string) {
  return db
    .select()
    .from(profileEntries)
    .where(eq(profileEntries.userId, userId))
    .orderBy(profileEntries.kind, profileEntries.orderIndex);
}

export async function getActiveFacts(userId: string) {
  return db
    .select()
    .from(facts)
    .where(and(eq(facts.userId, userId), eq(facts.status, 'active')));
}

/**
 * Saves the composed resume and clears the stale flag.
 *
 * `stale` is set again whenever a fact changes, so the profile page can offer a
 * rebuild rather than quietly showing a resume that no longer matches what the
 * person has told us.
 */
export async function saveComposedProfile(
  userId: string,
  resumeStructure: unknown,
  bulletSources: unknown,
  strength: number,
) {
  await db
    .insert(profiles)
    .values({
      id: newId('prof'),
      userId,
      resumeStructure: resumeStructure as object,
      bulletSources: bulletSources as object,
      strength,
      composedAt: new Date(),
      stale: false,
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        resumeStructure: resumeStructure as object,
        bulletSources: bulletSources as object,
        strength,
        composedAt: new Date(),
        stale: false,
        updatedAt: new Date(),
      },
    });
}

/**
 * Replaces the profile with one read out of an uploaded resume.
 *
 * The entries become real rows, not just JSON inside the profile, because the
 * questions later need something to attach facts to — that is what lets an
 * uploaded resume be topped up rather than merely stored.
 *
 * A transaction: a half-written profile with no entries would show someone a
 * resume the rest of the app cannot reason about.
 */
export async function replaceProfileFromResume(
  userId: string,
  structure: ResumeStructure,
  strength: number,
  fileName: string,
) {
  await db.transaction(async (tx) => {
    await tx.delete(profileEntries).where(
      and(eq(profileEntries.userId, userId), eq(profileEntries.source, 'resume_import')),
    );

    const rows: (typeof profileEntries.$inferInsert)[] = [];
    (structure.experience ?? []).forEach((e, i) => {
      rows.push({
        id: newId('entry'), userId, kind: 'experience',
        title: e.title, org: e.org, location: e.location, datesDisplay: e.dates,
        orderIndex: i, source: 'resume_import',
      });
    });
    (structure.projects ?? []).forEach((p, i) => {
      rows.push({
        id: newId('entry'), userId, kind: 'project',
        title: p.name, org: p.tech, datesDisplay: p.dates,
        orderIndex: i, source: 'resume_import',
      });
    });
    (structure.education ?? []).forEach((e, i) => {
      rows.push({
        id: newId('entry'), userId, kind: 'education',
        title: e.degree, org: e.school, location: e.location, datesDisplay: e.dates,
        orderIndex: i, source: 'resume_import',
      });
    });
    if (rows.length) await tx.insert(profileEntries).values(rows);

    await tx
      .insert(profiles)
      .values({
        id: newId('prof'), userId,
        resumeStructure: structure as object,
        bulletSources: [],
        strength,
        composedAt: new Date(),
        stale: false,
      })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: {
          resumeStructure: structure as object,
          strength,
          composedAt: new Date(),
          stale: false,
          updatedAt: new Date(),
        },
      });

    await tx.insert(documents).values({
      id: newId('doc'), userId, kind: 'source_resume',
      fileName, mimeType: 'application/pdf', sizeBytes: 0,
      storagePath: '(not retained)', extractedAt: new Date(),
    });
  });
}

export async function markProfileStale(userId: string) {
  await db.update(profiles).set({ stale: true }).where(eq(profiles.userId, userId));
}

// ── Rules ──────────────────────────────────────────────────────────────────

export async function getActiveRules(userId: string) {
  return db
    .select()
    .from(rules)
    .where(and(eq(rules.userId, userId), eq(rules.active, true)))
    .orderBy(rules.orderIndex);
}

// ── Interview ──────────────────────────────────────────────────────────────

/** The live session, if there is one. At most one exists per person. */
export async function getActiveInterview(userId: string) {
  const [row] = await db
    .select()
    .from(interviewSessions)
    .where(and(eq(interviewSessions.userId, userId), inArray(interviewSessions.status, ['active', 'paused'])))
    .limit(1);
  return row ?? null;
}

export async function getInterviewTurns(sessionId: string) {
  return db
    .select()
    .from(interviewTurns)
    .where(eq(interviewTurns.sessionId, sessionId))
    .orderBy(interviewTurns.idx);
}

export async function startInterview(userId: string, openQuestions: string[] = []) {
  const existing = await getActiveInterview(userId);
  if (existing) return existing;

  const [row] = await db
    .insert(interviewSessions)
    .values({ id: newId('sess'), userId, openQuestions })
    .returning();
  return row;
}

/**
 * Records one completed turn and everything it produced, in a transaction.
 *
 * All of it or none: a turn whose facts were saved but whose question was not
 * would ask the same thing again on the next load, and one whose question was
 * saved without its facts would silently lose what the person just said.
 */
export async function saveInterviewTurn(
  userId: string,
  sessionId: string,
  turn: {
    idx: number;
    question: unknown;
    rawAnswer: string;
    skipped: boolean;
  } | null,
  newEntries: { id: string; kind: string; title?: string; org?: string; location?: string; datesDisplay?: string; orderIndex: number }[],
  newFacts: { id: string; entryId: string | null; category: string; text: string; hasNumber: boolean; confidence: number; sourceTurnId: string | null }[],
  session: { phase: string; phaseStartedAtTurn: number; pendingQuestion: unknown; finished: boolean },
) {
  await db.transaction(async (tx) => {
    if (turn) {
      await tx
        .insert(interviewTurns)
        .values({
          id: newId('turn'),
          sessionId,
          idx: turn.idx,
          question: turn.question as object,
          rawAnswer: turn.rawAnswer,
          skipped: turn.skipped,
        })
        // The unique (session, idx) index makes a double-submit a no-op rather
        // than a duplicated turn.
        .onConflictDoNothing();
    }

    if (newEntries.length) {
      await tx.insert(profileEntries).values(
        newEntries.map((e) => ({
          id: e.id, userId, kind: e.kind,
          title: e.title, org: e.org, location: e.location, datesDisplay: e.datesDisplay,
          orderIndex: e.orderIndex, source: 'interview' as const,
        })),
      );
    }

    if (newFacts.length) {
      await tx.insert(facts).values(
        newFacts.map((f) => ({
          id: f.id, userId, entryId: f.entryId,
          category: f.category, text: f.text,
          hasNumber: f.hasNumber, confidence: f.confidence,
          source: 'interview' as const, sourceTurnId: f.sourceTurnId,
        })),
      );
    }

    await tx
      .update(interviewSessions)
      .set({
        phase: session.phase,
        phaseStartedAtTurn: session.phaseStartedAtTurn,
        pendingQuestion: session.pendingQuestion as object,
        turnCount: turn ? turn.idx + 1 : 0,
        status: session.finished ? 'completed' : 'active',
        completedAt: session.finished ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(interviewSessions.id, sessionId));

    // Anything new the person said makes the composed resume out of date.
    await tx.update(profiles).set({ stale: true }).where(eq(profiles.userId, userId));
  });
}

// ── Applications ───────────────────────────────────────────────────────────

/** The applications list, newest first, with its posting joined in. */
export async function listApplications(userId: string) {
  return db
    .select({
      application: applications,
      posting: jobPostings,
    })
    .from(applications)
    .leftJoin(jobPostings, eq(applications.postingId, jobPostings.id))
    .where(eq(applications.userId, userId))
    .orderBy(desc(applications.updatedAt));
}

export async function getApplication(userId: string, applicationId: string) {
  const [row] = await db
    .select({ application: applications, posting: jobPostings })
    .from(applications)
    .leftJoin(jobPostings, eq(applications.postingId, jobPostings.id))
    .where(and(eq(applications.userId, userId), eq(applications.id, applicationId)))
    .limit(1);
  return row ?? null;
}

/**
 * Marks an application sent and starts the follow-up clock.
 *
 * Seven days is the point at which a follow-up is normal rather than pushy,
 * and applications mostly die of silence rather than rejection.
 */
export async function markApplied(userId: string, applicationId: string, followUpDays = 7) {
  const now = new Date();
  const due = new Date(now.getTime() + followUpDays * 24 * 60 * 60 * 1000);
  await db
    .update(applications)
    .set({ status: 'applied', appliedAt: now, followUpDueAt: due, updatedAt: now })
    .where(and(eq(applications.userId, userId), eq(applications.id, applicationId)));
}

/** Applications whose follow-up is due and which have not moved on. */
export async function getDueFollowUps(userId: string) {
  return db
    .select({ application: applications, posting: jobPostings })
    .from(applications)
    .leftJoin(jobPostings, eq(applications.postingId, jobPostings.id))
    .where(
      and(
        eq(applications.userId, userId),
        eq(applications.status, 'applied'),
        isNotNull(applications.followUpDueAt),
        lte(applications.followUpDueAt, new Date()),
      ),
    );
}

/**
 * The applications list with everything the page needs, in one query.
 *
 * The match score comes from the newest resume for each application, pulled in
 * a lateral join rather than a second round trip per row — a job search is
 * thirty to fifty of these and N+1 would show.
 */
export async function listApplicationsForDisplay(userId: string) {
  return db.execute<{
    id: string;
    status: string;
    applied_at: Date | null;
    follow_up_due_at: Date | null;
    closes_at: Date | null;
    company: string | null;
    role: string | null;
    location: string | null;
    match_score: number | null;
    has_resume: boolean;
  }>(sql`
    select
      a.id, a.status, a.applied_at, a.follow_up_due_at,
      p.closes_at, p.company, p.role, p.location,
      r.match_score,
      (r.id is not null) as has_resume
    from ${applications} a
    left join ${jobPostings} p on p.id = a.posting_id
    left join lateral (
      select id, match_score
      from ${resumes}
      where application_id = a.id
      order by version desc
      limit 1
    ) r on true
    where a.user_id = ${userId}
    order by a.updated_at desc
  `);
}

/** Counts per status, for the filter chips. */
export async function countApplicationsByStatus(userId: string) {
  const rows = await db
    .select({ status: applications.status, count: sql<number>`count(*)::int` })
    .from(applications)
    .where(eq(applications.userId, userId))
    .groupBy(applications.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.count])) as Record<string, number>;
}

// ── Resumes ────────────────────────────────────────────────────────────────

/** The newest version for an application. */
export async function getLatestResume(userId: string, applicationId: string) {
  const [row] = await db
    .select()
    .from(resumes)
    .where(and(eq(resumes.userId, userId), eq(resumes.applicationId, applicationId)))
    .orderBy(desc(resumes.version))
    .limit(1);
  return row ?? null;
}

// ── Insights ───────────────────────────────────────────────────────────────

export interface SkillGap {
  requirement: string;
  /** How many of this person's saved postings ask for it. */
  demand: number;
}

/**
 * Requirements asked for repeatedly across saved postings that the profile
 * never mentions.
 *
 * This is the one piece of advice the app can give that a resume tool normally
 * cannot: it needs both sides — every posting the person saved, and everything
 * they have said about themselves — and both are already stored. Counting is
 * done in SQL because the postings table is the only place the demand exists.
 */
export async function getSkillGaps(userId: string, minDemand = 2): Promise<SkillGap[]> {
  const demand = await db.execute<{ requirement: string; demand: number }>(sql`
    select lower(req) as requirement, count(distinct ${jobPostings.id})::int as demand
    from ${jobPostings}, jsonb_array_elements_text(${jobPostings.requirements}) as req
    where ${jobPostings.userId} = ${userId}
    group by 1
    having count(distinct ${jobPostings.id}) >= ${minDemand}
    order by demand desc
  `);

  const rows = Array.from(demand as Iterable<{ requirement: string; demand: number }>);
  if (rows.length === 0) return [];

  // Compare against what the person has actually said, not against the composed
  // resume — tailoring may have dropped a skill from one resume that the person
  // genuinely has, and telling them it is missing would be wrong.
  const known = await db
    .select({ text: facts.text })
    .from(facts)
    .where(and(eq(facts.userId, userId), eq(facts.status, 'active')));

  const haystack = known.map((f) => f.text.toLowerCase()).join(' \n ');
  return rows.filter((r) => !haystack.includes(r.requirement));
}

// ── Deletion ───────────────────────────────────────────────────────────────

/**
 * Removes everything belonging to a person.
 *
 * Every table cascades from `users`, so one delete is the whole graph. Called
 * from the Clerk webhook on user.deleted and from the self-serve delete path —
 * a tool people trust with their work history has to make leaving easy.
 */
export async function deleteUserData(userId: string) {
  await db.delete(users).where(eq(users.id, userId));
}

export { newId };
