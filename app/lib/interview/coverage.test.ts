import assert from 'node:assert';
import test from 'node:test';
import type { Fact, FactCategory, ProfileEntry } from '../types';
import { computeCoverage, isCoverageSufficient } from './coverage';
import { hasMeaningfulNumber } from './taxonomy';

let seq = 0;
function entry(over: Partial<ProfileEntry> = {}): ProfileEntry {
  seq += 1;
  return {
    id: `e${seq}`,
    kind: 'experience',
    title: `Role ${seq}`,
    org: `Org ${seq}`,
    orderIndex: 0,
    source: 'interview',
    ...over,
  };
}

function fact(entryId: string | null, category: FactCategory, over: Partial<Fact> = {}): Fact {
  seq += 1;
  return {
    id: `f${seq}`,
    entryId,
    category,
    text: `fact ${seq}`,
    hasNumber: false,
    confidence: 1,
    source: 'interview',
    sourceTurnId: null,
    status: 'active',
    ...over,
  };
}

/** All six required categories for an entry, with a real metric. */
function fullyCovered(entryId: string): Fact[] {
  return [
    fact(entryId, 'action'),
    fact(entryId, 'metric', { hasNumber: true }),
    fact(entryId, 'scope'),
    fact(entryId, 'tooling'),
    fact(entryId, 'outcome'),
    fact(entryId, 'context'),
  ];
}

test('hasMeaningfulNumber: vague improvement claims are not metrics', () => {
  assert.equal(hasMeaningfulNumber('improved performance a lot'), false);
  assert.equal(hasMeaningfulNumber('made it significantly faster'), false);
  assert.equal(hasMeaningfulNumber(''), false);
});

test('hasMeaningfulNumber: a bare year is not a metric', () => {
  assert.equal(hasMeaningfulNumber('joined the team in 2019'), false);
  assert.equal(hasMeaningfulNumber('shipped it in 2023'), false);
});

test('hasMeaningfulNumber: real quantities count', () => {
  assert.equal(hasMeaningfulNumber('cut p95 latency by 40%'), true);
  assert.equal(hasMeaningfulNumber('led a team of 4'), true);
  assert.equal(hasMeaningfulNumber('served 12k users'), true);
  assert.equal(hasMeaningfulNumber('reduced build from 800ms to 240ms'), true);
  assert.equal(hasMeaningfulNumber('saved $30,000 annually'), true);
  assert.equal(hasMeaningfulNumber('3x throughput'), true);
});

test('a metric fact without a number does NOT close the metric gap', () => {
  const e = entry();
  const facts = [fact(e.id, 'metric', { text: 'improved performance', hasNumber: false })];

  const report = computeCoverage([e], facts);

  assert.ok(
    report.perEntry[0].missing.includes('metric'),
    'an unquantified metric fact must leave the metric gap open',
  );
  assert.ok(report.globals.entriesWithNoMetric.includes(e.id));
});

test('a metric fact with a number does close the metric gap', () => {
  const e = entry();
  const facts = [fact(e.id, 'metric', { text: 'cut latency 40%', hasNumber: true })];

  const report = computeCoverage([e], facts);

  assert.ok(!report.perEntry[0].missing.includes('metric'));
  assert.ok(!report.globals.entriesWithNoMetric.includes(e.id));
});

test('archived and superseded facts are ignored', () => {
  const e = entry();
  const facts = [
    fact(e.id, 'action', { status: 'archived' }),
    fact(e.id, 'scope', { status: 'superseded' }),
  ];

  const report = computeCoverage([e], facts);

  assert.ok(report.perEntry[0].missing.includes('action'));
  assert.ok(report.perEntry[0].missing.includes('scope'));
});

test('an entry with no facts outranks a partially covered one', () => {
  const recent = entry({ orderIndex: 0 });
  const older = entry({ orderIndex: 1 });
  // Give the recent entry everything except context, leave the older one empty.
  const facts = [
    fact(recent.id, 'action'),
    fact(recent.id, 'metric', { hasNumber: true }),
    fact(recent.id, 'scope'),
    fact(recent.id, 'tooling'),
    fact(recent.id, 'outcome'),
  ];

  const report = computeCoverage([recent, older], facts);
  const topEntryGap = report.gaps.find((g) => g.entryId !== null);

  assert.equal(
    topEntryGap?.entryId,
    older.id,
    'breadth before depth: the empty entry should be asked about first',
  );
});

test('between two equally empty entries, the more recent ranks higher', () => {
  const recent = entry({ orderIndex: 0 });
  const older = entry({ orderIndex: 2 });

  const report = computeCoverage([recent, older], []);
  const firstMetric = report.gaps.find((g) => g.category === 'metric');

  assert.equal(firstMetric?.entryId, recent.id);
});

test('metric outranks context within the same entry', () => {
  const e = entry();
  const report = computeCoverage([e], []);

  const metric = report.gaps.find((g) => g.entryId === e.id && g.category === 'metric')!;
  const context = report.gaps.find((g) => g.entryId === e.id && g.category === 'context')!;

  assert.ok(metric.priority > context.priority);
});

test('gaps come back sorted by priority, highest first', () => {
  const report = computeCoverage([entry({ orderIndex: 0 }), entry({ orderIndex: 1 })], []);
  const priorities = report.gaps.map((g) => g.priority);
  const sorted = [...priorities].sort((a, b) => b - a);

  assert.deepEqual(priorities, sorted);
});

test('education entries are not scored against metric/scope', () => {
  const school = entry({ kind: 'education', orderIndex: 0 });

  const report = computeCoverage([school], []);

  assert.equal(report.perEntry.length, 0, 'education is not a scored entry');
  assert.ok(!report.gaps.some((g) => g.entryId === school.id));
});

test('global gaps appear for missing email, education, and skills', () => {
  const report = computeCoverage([], []);
  const categories = report.gaps.filter((g) => g.entryId === null).map((g) => g.category);

  assert.ok(categories.includes('identity'), 'missing email should raise a gap');
  assert.ok(categories.includes('credential'), 'missing education should raise a gap');
  assert.ok(categories.includes('skill'), 'too few skills should raise a gap');
});

test('an email fact clears the email gap', () => {
  const facts = [fact(null, 'identity', { text: 'alex@example.com' })];
  const report = computeCoverage([], facts);

  assert.equal(report.globals.hasContactEmail, true);
  assert.ok(!report.gaps.some((g) => g.entryId === null && g.category === 'identity'));
});

test('a well-covered profile is sufficient', () => {
  const e = entry();
  const school = entry({ kind: 'education' });
  const facts = [
    ...fullyCovered(e.id),
    fact(null, 'identity', { text: 'alex@example.com' }),
    fact(null, 'skill'),
    fact(null, 'skill'),
    fact(null, 'skill'),
  ];

  const report = computeCoverage([e, school], facts);

  assert.ok(report.overall >= 0.8, `expected overall >= 0.8, got ${report.overall}`);
  assert.equal(isCoverageSufficient(report), true);
});

test('one unquantified entry blocks sufficiency even at high coverage', () => {
  const good = entry();
  const weak = entry();
  const school = entry({ kind: 'education' });
  const facts = [
    ...fullyCovered(good.id),
    // weak has everything except a real metric
    fact(weak.id, 'action'),
    fact(weak.id, 'metric', { text: 'made it faster', hasNumber: false }),
    fact(weak.id, 'scope'),
    fact(weak.id, 'tooling'),
    fact(weak.id, 'outcome'),
    fact(weak.id, 'context'),
    fact(null, 'identity', { text: 'alex@example.com' }),
    fact(null, 'skill'),
    fact(null, 'skill'),
    fact(null, 'skill'),
  ];

  const report = computeCoverage([good, weak, school], facts);

  assert.equal(
    isCoverageSufficient(report),
    false,
    'an entry with no real metric must block completion regardless of average',
  );
});

test('an empty profile scores zero and is not sufficient', () => {
  const report = computeCoverage([], []);

  assert.equal(report.overall, 0);
  assert.equal(isCoverageSufficient(report), false);
});

// ── Tiering ────────────────────────────────────────────────────────────────
// Requiring all six categories of every entry made the interview grow with the
// length of someone's history: ten entries meant sixty gaps, and being thorough
// about your past was punished with a forty-question interview.

test('only the most recent entries of each kind are held to full depth', () => {
  const jobs = [entry({ orderIndex: 0 }), entry({ orderIndex: 1 }), entry({ orderIndex: 2 })];
  const projects = [
    entry({ kind: 'project', orderIndex: 0 }),
    entry({ kind: 'project', orderIndex: 1 }),
  ];

  const report = computeCoverage([...jobs, ...projects], []);
  const deep = new Set(report.perEntry.filter((e) => e.deep).map((e) => e.entryId));

  assert.equal(deep.size, 3, 'two jobs and one project');
  assert.ok(deep.has(jobs[0].id) && deep.has(jobs[1].id), 'the two most recent jobs');
  assert.ok(deep.has(projects[0].id), 'the most recent project');
  assert.ok(!deep.has(jobs[2].id) && !deep.has(projects[1].id), 'and nothing older');
});

test('a shallow entry needs only what it did and what it used', () => {
  // Two jobs fill the deep quota, so the third is shallow.
  const first = entry({ orderIndex: 0 });
  const second = entry({ orderIndex: 1 });
  const older = entry({ orderIndex: 2 });
  const facts = [fact(older.id, 'action'), fact(older.id, 'tooling')];

  const report = computeCoverage([first, second, older], facts);
  const shallow = report.perEntry.find((e) => e.entryId === older.id)!;

  assert.equal(shallow.deep, false);
  assert.equal(shallow.score, 1, 'action and tooling is a complete shallow entry');
  assert.deepEqual(shallow.missing, []);
});

test('a shallow entry without a number does not block completion', () => {
  // Two deep jobs fully covered, plus a long tail that will never have metrics.
  const a = entry({ orderIndex: 0 });
  const b = entry({ orderIndex: 1 });
  const tail = [2, 3, 4, 5].map((i) => entry({ orderIndex: i }));
  const school = entry({ kind: 'education' });

  const facts = [
    ...fullyCovered(a.id),
    ...fullyCovered(b.id),
    ...tail.flatMap((t) => [fact(t.id, 'action'), fact(t.id, 'tooling')]),
    fact(null, 'identity', { text: 'alex@example.com' }),
    fact(null, 'skill'),
    fact(null, 'skill'),
    fact(null, 'skill'),
  ];

  const report = computeCoverage([a, b, ...tail, school], facts);

  assert.equal(report.gaps.length, 0, 'nothing left to ask');
  assert.equal(
    isCoverageSufficient(report),
    true,
    'six entries and no outstanding questions should be finishable',
  );
});

test('a deep entry without a number still blocks completion', () => {
  const recent = entry({ orderIndex: 0 });
  const school = entry({ kind: 'education' });
  const facts = [
    fact(recent.id, 'action'),
    fact(recent.id, 'metric', { text: 'made it faster', hasNumber: false }),
    fact(recent.id, 'scope'),
    fact(recent.id, 'tooling'),
    fact(recent.id, 'outcome'),
    fact(recent.id, 'context'),
    fact(null, 'identity', { text: 'alex@example.com' }),
    fact(null, 'skill'),
    fact(null, 'skill'),
    fact(null, 'skill'),
  ];

  const report = computeCoverage([recent, school], facts);
  assert.equal(isCoverageSufficient(report), false, 'the entries that matter still need numbers');
});

test('ten entries produce far fewer gaps than ten times six', () => {
  const entries = Array.from({ length: 10 }, (_, i) => entry({ orderIndex: i }));
  const report = computeCoverage(entries, []);

  const entryGaps = report.gaps.filter((g) => g.entryId !== null).length;
  // Two deep at six, eight shallow at two.
  assert.equal(entryGaps, 2 * 6 + 8 * 2);
  assert.ok(entryGaps < 60, `a long history must not mean sixty questions, got ${entryGaps}`);
});
