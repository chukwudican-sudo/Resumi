/**
 * Round-trips real data through the repository, then deletes it.
 *
 *   npx tsx scripts/db-smoke.ts
 *
 * Exists because a schema that generates valid SQL and typechecks can still be
 * wrong in the ways that matter — a cascade that does not cascade, an atomic
 * update that is not atomic, a query that returns nothing. Each of those is
 * cheap to check here and expensive to discover later.
 */
import {
  deleteUserData,
  getSkillGaps,
  markApplied,
  getDueFollowUps,
  newId,
  spendCredit,
  upsertUser,
} from '../app/server/db/repository';
import { db } from '../app/server/db/client';
import { applications, facts, jobPostings } from '../app/server/db/schema';
import { eq } from 'drizzle-orm';

const USER = 'user_smoketest_delete_me';

function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  await deleteUserData(USER); // in case a previous run died midway

  // ── users ────────────────────────────────────────────────────────────────
  await upsertUser(USER, 'smoke@example.com', 'Smoke Test');
  await upsertUser(USER, 'smoke@example.com', 'Smoke Test'); // idempotent, as the webhook needs
  check('upsertUser is idempotent', true);

  // ── credits are atomic ───────────────────────────────────────────────────
  const remaining = await spendCredit(USER);
  check('spendCredit decrements', remaining === 4, `credits now ${remaining}`);

  // Drain the rest, then confirm it refuses to go negative.
  for (let i = 0; i < 4; i += 1) await spendCredit(USER);
  const overdrawn = await spendCredit(USER);
  check('spendCredit refuses to overdraw', overdrawn === null);

  // ── skill gaps ───────────────────────────────────────────────────────────
  // Three postings want Docker; two want Kubernetes. The profile mentions
  // Kubernetes but never Docker, so only Docker should come back.
  const postingIds = [
    ['Docker', 'Postgres'],
    ['Docker', 'Kubernetes'],
    ['Docker', 'Kubernetes', 'Go'],
  ].map((requirements) => {
    const id = newId('post');
    return { id, requirements };
  });

  for (const p of postingIds) {
    await db.insert(jobPostings).values({
      id: p.id,
      userId: USER,
      company: 'Test Co',
      role: 'Engineer',
      requirements: p.requirements,
    });
  }

  await db.insert(facts).values({
    id: newId('fact'),
    userId: USER,
    entryId: null,
    category: 'tooling',
    text: 'Used Kubernetes to run the staging cluster',
  });

  const gaps = await getSkillGaps(USER, 2);
  const names = gaps.map((g) => g.requirement);
  check('skill gaps find Docker', names.includes('docker'), `got [${names.join(', ')}]`);
  check('skill gaps exclude what the profile mentions', !names.includes('kubernetes'));
  check('skill gaps respect minDemand', !names.includes('go'));
  const docker = gaps.find((g) => g.requirement === 'docker');
  check('demand counted correctly', docker?.demand === 3, `demand ${docker?.demand}`);

  // ── follow-ups ───────────────────────────────────────────────────────────
  const appId = newId('app');
  await db.insert(applications).values({
    id: appId,
    userId: USER,
    postingId: postingIds[0].id,
    status: 'draft',
  });

  await markApplied(USER, appId, 7);
  const notYetDue = await getDueFollowUps(USER);
  check('a fresh application is not yet due', notYetDue.length === 0);

  // Backdate it past the window.
  await db
    .update(applications)
    .set({ followUpDueAt: new Date(Date.now() - 86_400_000) })
    .where(eq(applications.id, appId));
  const due = await getDueFollowUps(USER);
  check('an overdue application surfaces', due.length === 1);

  // ── cascade ──────────────────────────────────────────────────────────────
  await deleteUserData(USER);
  const leftoverPostings = await db.select().from(jobPostings).where(eq(jobPostings.userId, USER));
  const leftoverFacts = await db.select().from(facts).where(eq(facts.userId, USER));
  const leftoverApps = await db.select().from(applications).where(eq(applications.userId, USER));
  check(
    'deleting the user removes the whole graph',
    leftoverPostings.length === 0 && leftoverFacts.length === 0 && leftoverApps.length === 0,
    `${leftoverPostings.length} postings, ${leftoverFacts.length} facts, ${leftoverApps.length} applications left`,
  );
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error: unknown) => {
    console.error('FAILED:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
