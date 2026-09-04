import { and, desc, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { db } from './client';
import type { ResumeStructure } from '../../lib/types';
import { splitEmployment } from '../../lib/employment';
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
  usageEvents,
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

/**
 * Records what the account already tells us, so the interview never asks for it.
 *
 * Someone who signed in with Google has handed over their name and email
 * already. Opening a conversation by asking for either is the fastest way to
 * signal that nothing is being paid attention to — and it violates the one rule
 * the interview leans on hardest, on its very first question.
 *
 * Written once, at account creation. Anything the person later corrects in the
 * conversation supersedes these rather than colliding with them.
 */
export async function seedIdentityFacts(userId: string, name: string | null, email: string | null) {
  const rows: (typeof facts.$inferInsert)[] = [];
  if (name?.trim()) {
    rows.push({
      id: newId('fact'), userId, entryId: null,
      category: 'identity', text: `Name: ${name.trim()}`,
      hasNumber: false, confidence: 1, source: 'manual', sourceTurnId: null,
    });
  }
  if (email?.trim()) {
    rows.push({
      id: newId('fact'), userId, entryId: null,
      category: 'identity', text: `Email: ${email.trim()}`,
      hasNumber: false, confidence: 1, source: 'manual', sourceTurnId: null,
    });
  }
  if (rows.length) await db.insert(facts).values(rows).onConflictDoNothing();
}

/**
 * Saves the contact block someone filled in during onboarding.
 *
 * Stored as identity facts rather than columns so composing reads them the same
 * way it reads everything else — one path from "something the person told us"
 * to "a line on the resume", with no second mechanism to keep in step.
 *
 * Replaces rather than appends: this is a form someone can come back and
 * correct, and two conflicting phone numbers is worse than none.
 */
export async function saveContactDetails(
  userId: string,
  details: { label: string; value: string }[],
) {
  await db.transaction(async (tx) => {
    // Same reasoning as skills below: the form holds the whole set, so a
    // source-scoped delete would leave older copies to be rendered alongside.
    await tx
      .delete(facts)
      .where(and(eq(facts.userId, userId), eq(facts.category, 'identity')));

    const rows = details
      .filter((d) => d.value.trim())
      .map((d) => ({
        id: newId('fact'),
        userId,
        entryId: null,
        category: 'identity',
        text: `${d.label}: ${d.value.trim()}`,
        hasNumber: false,
        confidence: 1,
        source: 'manual' as const,
        sourceTurnId: null,
      }));

    if (rows.length) await tx.insert(facts).values(rows);

    // The resume no longer reflects what we know about them.
    await tx.update(profiles).set({ stale: true }).where(eq(profiles.userId, userId));
  });
}

/** How much the profile knows, for the reassurance line before tailoring. */
export async function countFacts(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(facts)
    .where(and(eq(facts.userId, userId), eq(facts.status, 'active')));
  return row?.n ?? 0;
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

/**
 * Every rule, including the switched-off ones.
 *
 * The page needs those: turning a rule off is how someone parks it without
 * losing the wording they worked out, and a rule that vanished when disabled
 * would make the toggle indistinguishable from delete.
 */
export async function listRules(userId: string) {
  return db.select().from(rules).where(eq(rules.userId, userId)).orderBy(rules.orderIndex);
}

export async function createRule(userId: string, text: string): Promise<string> {
  // New rules go last: order carries meaning once the prompt reads them in
  // sequence, and inserting at the top would silently reprioritise the others.
  const [last] = await db
    .select({ orderIndex: rules.orderIndex })
    .from(rules)
    .where(eq(rules.userId, userId))
    .orderBy(desc(rules.orderIndex))
    .limit(1);

  const [row] = await db
    .insert(rules)
    .values({
      id: newId('rule'),
      userId,
      text: text.trim(),
      orderIndex: (last?.orderIndex ?? -1) + 1,
    })
    .returning({ id: rules.id });
  return row.id;
}

export async function updateRule(userId: string, ruleId: string, text: string) {
  await db
    .update(rules)
    .set({ text: text.trim(), updatedAt: new Date() })
    .where(and(eq(rules.userId, userId), eq(rules.id, ruleId)));
}

export async function setRuleActive(userId: string, ruleId: string, active: boolean) {
  await db
    .update(rules)
    .set({ active, updatedAt: new Date() })
    .where(and(eq(rules.userId, userId), eq(rules.id, ruleId)));
}

export async function deleteRule(userId: string, ruleId: string) {
  await db.delete(rules).where(and(eq(rules.userId, userId), eq(rules.id, ruleId)));
}

/**
 * Writes a new order for the ids given.
 *
 * Every statement carries the userId, so an id belonging to someone else
 * updates nothing rather than reordering their rules.
 */
export async function reorderRules(userId: string, orderedIds: string[]) {
  await Promise.all(
    orderedIds.map((ruleId, index) =>
      db
        .update(rules)
        .set({ orderIndex: index, updatedAt: new Date() })
        .where(and(eq(rules.userId, userId), eq(rules.id, ruleId))),
    ),
  );
}

export async function getActiveRules(userId: string) {
  return db
    .select()
    .from(rules)
    .where(and(eq(rules.userId, userId), eq(rules.active, true)))
    .orderBy(rules.orderIndex);
}

// ── The setup form ─────────────────────────────────────────────────────────

/**
 * Everything the form edits: entries with their own bullets, plus the identity
 * and skill facts that make up the contact block and skills section.
 */
export async function getResumeInputs(userId: string) {
  const [entryRows, factRows] = await Promise.all([
    db
      .select()
      .from(profileEntries)
      .where(eq(profileEntries.userId, userId))
      .orderBy(profileEntries.kind, profileEntries.orderIndex),
    db
      .select({ category: facts.category, text: facts.text })
      .from(facts)
      .where(and(eq(facts.userId, userId), eq(facts.status, 'active'))),
  ]);
  return { entryRows, factRows };
}

/**
 * Adds or updates one entry.
 *
 * The id comes from the client, which means it is a request to edit something
 * rather than proof of owning it — the where clause carries the userId, so a
 * borrowed id updates nothing rather than someone else's history.
 */
export async function upsertEntry(
  userId: string,
  entry: {
    id: string | null;
    kind: string;
    title: string;
    org: string;
    location: string;
    datesDisplay: string;
    tech: string;
    bullets: string[];
    dates: {
      startMonth: number | null; startYear: number | null;
      endMonth: number | null; endYear: number | null; isCurrent: boolean;
    };
    place: { city: string | null; region: string | null; country: string | null };
    url: string;
    extra: Record<string, string>;
  },
): Promise<string> {
  const bullets = entry.bullets.map((b) => b.trim()).filter(Boolean);

  if (entry.id) {
    const [row] = await db
      .update(profileEntries)
      .set({
        title: entry.title, org: entry.org, location: entry.location,
        datesDisplay: entry.datesDisplay, tech: entry.tech, url: entry.url,
        city: entry.place.city, region: entry.place.region, country: entry.place.country,
        startMonth: entry.dates.startMonth, startYear: entry.dates.startYear,
        endMonth: entry.dates.endMonth, endYear: entry.dates.endYear,
        isCurrent: entry.dates.isCurrent,
        extra: entry.extra,
        bullets, updatedAt: new Date(),
      })
      .where(and(eq(profileEntries.userId, userId), eq(profileEntries.id, entry.id)))
      .returning({ id: profileEntries.id });
    if (row) {
      await markProfileStale(userId);
      return row.id;
    }
    // Fell through: the id was not theirs. Treated as a new entry rather than
    // an error, so a stale tab cannot silently discard what someone just typed.
  }

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${profileEntries.orderIndex}) + 1, 0)::int` })
    .from(profileEntries)
    .where(and(eq(profileEntries.userId, userId), eq(profileEntries.kind, entry.kind)));

  const id = newId('entry');
  await db.insert(profileEntries).values({
    id, userId, kind: entry.kind,
    title: entry.title, org: entry.org, location: entry.location,
    datesDisplay: entry.datesDisplay, tech: entry.tech, url: entry.url,
    city: entry.place.city, region: entry.place.region, country: entry.place.country,
    startMonth: entry.dates.startMonth, startYear: entry.dates.startYear,
    endMonth: entry.dates.endMonth, endYear: entry.dates.endYear,
    isCurrent: entry.dates.isCurrent,
    extra: entry.extra,
    bullets, orderIndex: next, source: 'manual',
  });
  await markProfileStale(userId);
  return id;
}

/**
 * Applies spelling corrections to the entries themselves.
 *
 * The correction has to land on the data, not on the rendered resume. Fixing
 * "San Fransisco" in the generated PDF leaves the Experience entry still
 * spelling it wrong, and the resume is rebuilt from those entries on the next
 * save — so the typo comes back, and it was never fixed anywhere it mattered.
 *
 * Whole words only. A substring replace would turn a correction of "ap" into
 * damage spread across every field that happens to contain those letters.
 *
 * Dates and urls are deliberately not included. A "correction" to a date is a
 * change of fact rather than of spelling, and a url looks misspelled to any
 * spellchecker — "fixing" github.com/chukwudican-sudo produces a dead link on
 * a resume, which is worse than the typo it was trying to solve.
 */
export async function applyCorrectionsToEntries(
  userId: string,
  corrections: { from: string; to: string }[],
): Promise<number> {
  if (!corrections.length) return 0;

  const rows = await db.select().from(profileEntries).where(eq(profileEntries.userId, userId));
  const fields = ['title', 'org', 'location', 'city', 'region', 'country', 'tech'] as const;

  // Built once rather than per field per row, and escaped because a correction
  // is text somebody typed, not a pattern we wrote.
  const patterns = corrections.map((c) => ({
    pattern: new RegExp(`\\b${c.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'),
    to: c.to,
  }));
  const fix = (text: string) => patterns.reduce((acc, p) => acc.replace(p.pattern, p.to), text);

  let changed = 0;

  for (const row of rows) {
    const patch: Record<string, unknown> = {};

    for (const field of fields) {
      const before = row[field];
      if (!before) continue;
      const after = fix(before);
      if (after !== before) patch[field] = after;
    }

    // Bullets too. This is where a typo actually lives — a misspelling in a
    // sentence someone wrote about their own work is far more likely than one
    // in a company name, and it is the more embarrassing of the two.
    const bullets = (row.bullets as string[] | null) ?? [];
    const fixedBullets = bullets.map(fix);
    if (fixedBullets.some((b, i) => b !== bullets[i])) patch.bullets = fixedBullets;

    // GPA, honours, the credential. Text somebody typed, so text that can be
    // misspelled.
    const extra = (row.extra as Record<string, string> | null) ?? null;
    if (extra) {
      const fixedExtra = Object.fromEntries(
        Object.entries(extra).map(([k, v]) => [k, typeof v === 'string' ? fix(v) : v]),
      );
      if (JSON.stringify(fixedExtra) !== JSON.stringify(extra)) patch.extra = fixedExtra;
    }

    if (Object.keys(patch).length) {
      await db
        .update(profileEntries)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(profileEntries.userId, userId), eq(profileEntries.id, row.id)));
      changed += 1;
    }
  }

  return changed;
}

/**
 * The same corrections, applied to the skills.
 *
 * Skills are facts rather than entry columns, so they are not reached by the
 * loop above — which meant a misspelled skill was carried through the grouping
 * and printed exactly as typed.
 */
/**
 * Moves a job type out of a title and into the chip that owns it.
 *
 * People write "Operations & Client Engagement (Full-Time)" because a resume
 * has nowhere else to put it. Here there is somewhere else, so the title
 * becomes just the title and the chip carries the type — and the chip wins when
 * the two disagree, since it is the field that exists for the purpose.
 */
export async function normaliseEmploymentTitles(userId: string): Promise<number> {
  const rows = await db
    .select()
    .from(profileEntries)
    .where(and(eq(profileEntries.userId, userId), eq(profileEntries.kind, 'experience')));

  let changed = 0;
  for (const row of rows) {
    if (!row.title) continue;
    const { title, employment } = splitEmployment(row.title);
    if (title === row.title) continue;

    const extra = (row.extra as Record<string, string> | null) ?? {};
    await db
      .update(profileEntries)
      .set({
        title,
        // Only filled in when empty. A chip that was set deliberately is not
        // overruled by something typed into a title.
        extra: extra.employment ? extra : { ...extra, ...(employment ? { employment } : {}) },
        updatedAt: new Date(),
      })
      .where(and(eq(profileEntries.userId, userId), eq(profileEntries.id, row.id)));
    changed += 1;
  }
  return changed;
}

export async function applyCorrectionsToSkillFacts(
  userId: string,
  corrections: { from: string; to: string }[],
): Promise<number> {
  if (!corrections.length) return 0;

  const rows = await db
    .select({ id: facts.id, text: facts.text })
    .from(facts)
    .where(and(eq(facts.userId, userId), eq(facts.category, 'skill')));

  const patterns = corrections.map((c) => ({
    pattern: new RegExp(`\\b${c.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'),
    to: c.to,
  }));

  let changed = 0;
  for (const row of rows) {
    const after = patterns.reduce((acc, p) => acc.replace(p.pattern, p.to), row.text);
    if (after === row.text) continue;
    await db
      .update(facts)
      .set({ text: after })
      .where(and(eq(facts.userId, userId), eq(facts.id, row.id)));
    changed += 1;
  }
  return changed;
}

export async function deleteEntry(userId: string, entryId: string) {
  await db
    .delete(profileEntries)
    .where(and(eq(profileEntries.userId, userId), eq(profileEntries.id, entryId)));
  await markProfileStale(userId);
}

/** Replaces the skills block. Grouped as `Category: items`. */
export async function saveSkillGroups(
  userId: string,
  groups: { category: string; items: string }[],
) {
  await db.transaction(async (tx) => {
    // Every skill fact goes, not only the ones this form wrote.
    //
    // Scoping the delete to source='manual' left the interview's copies behind,
    // so saving the form added a second copy of skills that were already there
    // and the resume printed each one twice. The form is shown every skill fact
    // regardless of origin, so what it saves is the complete set — anything
    // still in the table afterwards is a duplicate by definition.
    await tx
      .delete(facts)
      .where(and(eq(facts.userId, userId), eq(facts.category, 'skill')));

    const seen = new Set<string>();
    const rows = groups
      .filter((g) => {
        const key = `${g.category.trim()}|${g.items.trim()}`;
        if (!g.items.trim() || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((g) => ({
        id: newId('fact'), userId, entryId: null,
        category: 'skill', text: `${g.category.trim() || 'Skills'}: ${g.items.trim()}`,
        hasNumber: false, confidence: 1, source: 'manual' as const, sourceTurnId: null,
      }));

    if (rows.length) await tx.insert(facts).values(rows);
    await tx.update(profiles).set({ stale: true }).where(eq(profiles.userId, userId));
  });
}

/** Stores the deterministic render so other pages can read one shape. */
/**
 * Stores the rendered master resume.
 *
 * `stale` says whether the resume still needs the editorial pass, and the
 * caller has to say which it is. It used to be hardcoded false, which meant
 * saving an entry marked the resume as freshly polished — so editing your
 * resume declared it did not need polishing, and polish could never run at the
 * one moment it was needed. A typo typed into a bullet went straight through to
 * the PDF, and the flag said everything was fine.
 */
export async function saveMasterResume(
  userId: string,
  structure: unknown,
  strength: number,
  stale = true,
) {
  await db
    .insert(profiles)
    .values({
      id: newId('prof'), userId,
      resumeStructure: structure as object, bulletSources: [],
      strength, composedAt: new Date(), stale,
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        resumeStructure: structure as object,
        strength, composedAt: new Date(), stale, updatedAt: new Date(),
      },
    });
}

/** Records what someone said in answer to the job-specific questions. */
export async function addFactsFromAnswers(
  userId: string,
  rows: { entryId: string | null; category: string; text: string; hasNumber: boolean }[],
) {
  if (rows.length === 0) return;
  await db.insert(facts).values(
    rows.map((r) => ({
      id: newId('fact'), userId, entryId: r.entryId,
      category: r.category, text: r.text, hasNumber: r.hasNumber,
      confidence: 1, source: 'interview' as const, sourceTurnId: null,
    })),
  );
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

/**
 * Starts an interview, or returns the one already running.
 *
 * The check-then-insert is not enough on its own: two requests can both find no
 * session and both try to create one — which React's development double-invoke
 * makes reliable rather than rare. The partial unique index is what actually
 * enforces "one live interview per person", so the conflict is expected and the
 * loser simply reads back the winner's row.
 */
export async function startInterview(userId: string, openQuestions: string[] = []) {
  const existing = await getActiveInterview(userId);
  if (existing) return existing;

  const [row] = await db
    .insert(interviewSessions)
    .values({ id: newId('sess'), userId, openQuestions })
    .onConflictDoNothing()
    .returning();

  return row ?? (await getActiveInterview(userId));
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
 * Saves a posting and opens an application against it, together.
 *
 * One transaction: an application pointing at a posting that failed to save
 * would show as a row with no job attached, which is worse than not creating it.
 */
export async function createApplication(
  userId: string,
  posting: {
    company: string | null;
    role: string | null;
    location: string | null;
    description: string | null;
    sourceUrl: string | null;
    requirements: string[];
  },
): Promise<string> {
  const postingId = newId('post');
  const applicationId = newId('app');

  await db.transaction(async (tx) => {
    await tx.insert(jobPostings).values({
      id: postingId,
      userId,
      company: posting.company,
      role: posting.role,
      location: posting.location,
      description: posting.description,
      sourceUrl: posting.sourceUrl,
      requirements: posting.requirements,
    });
    await tx.insert(applications).values({
      id: applicationId,
      userId,
      postingId,
      status: 'draft',
    });
  });

  return applicationId;
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

/**
 * Records a generated resume against its application.
 *
 * A new row per version rather than an update: it makes comparison and undo
 * free, and it means an instruction edit can never destroy the thing it was
 * meant to improve.
 */
export async function saveResume(
  userId: string,
  applicationId: string,
  data: {
    structure: unknown;
    matchScore: number | null;
    missingRequirements: string[];
    log: string[];
    warnings: string[];
    estimatedPages: number | null;
  },
): Promise<string> {
  const previous = await getLatestResume(userId, applicationId);
  const id = newId('res');

  await db.insert(resumes).values({
    id,
    userId,
    applicationId,
    mode: 'tailored',
    structure: data.structure as object,
    matchScore: data.matchScore,
    missingRequirements: data.missingRequirements,
    log: data.log,
    warnings: data.warnings,
    estimatedPages: data.estimatedPages,
    version: (previous?.version ?? 0) + 1,
    parentResumeId: previous?.id ?? null,
    status: 'complete',
  });

  await db
    .update(applications)
    .set({ updatedAt: new Date() })
    .where(and(eq(applications.userId, userId), eq(applications.id, applicationId)));

  return id;
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

// ── Metering ───────────────────────────────────────────────────────────────

/**
 * Records one model call.
 *
 * Written after every call rather than on a sampled or batched basis: this
 * table is what the spend ceiling reads, and a ceiling computed from an
 * incomplete record is not a ceiling.
 */
export async function recordUsage(
  userId: string,
  event: {
    kind: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    costUsd: number;
    resumeId?: string | null;
    sessionId?: string | null;
  },
) {
  await db.insert(usageEvents).values({
    userId,
    kind: event.kind,
    model: event.model,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    cacheReadTokens: event.cacheReadTokens,
    cacheWriteTokens: event.cacheWriteTokens,
    // numeric() takes a string; passing a float would round-trip through
    // double and lose fractions of a cent across thousands of rows.
    costUsd: event.costUsd.toFixed(6),
    resumeId: event.resumeId ?? null,
    sessionId: event.sessionId ?? null,
  });
}

/**
 * What has been spent, and how hard this person has been going.
 *
 * One query rather than two because it runs before every model call, and the
 * point of a cost guard is undermined if the guard itself is expensive.
 *
 * A rolling 24 hours, not a calendar day: a calendar day has a moment when the
 * budget resets, and anyone who notices can wait for it.
 */
export async function getUsageWindow(userId: string): Promise<{
  spentLast24hUsd: number;
  userCallsLastMinute: number;
  userSpentLast24hUsd: number;
}> {
  const [row] = await db.execute(sql`
    select
      coalesce(sum(cost_usd), 0)::float8 as spent_24h,
      coalesce(count(*) filter (
        where user_id = ${userId} and created_at >= now() - interval '1 minute'
      ), 0)::int as user_calls_1m,
      coalesce(sum(cost_usd) filter (where user_id = ${userId}), 0)::float8 as user_spent_24h
    from usage_events
    where created_at >= now() - interval '24 hours'
  `) as unknown as [{ spent_24h: number; user_calls_1m: number; user_spent_24h: number }];

  return {
    spentLast24hUsd: Number(row?.spent_24h ?? 0),
    userCallsLastMinute: Number(row?.user_calls_1m ?? 0),
    userSpentLast24hUsd: Number(row?.user_spent_24h ?? 0),
  };
}
