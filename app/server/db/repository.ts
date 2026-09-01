import { and, desc, eq, isNotNull, lte, sql } from 'drizzle-orm';
import { db } from './client';
import {
  applications,
  facts,
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
