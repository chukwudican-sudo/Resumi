import assert from 'node:assert';
import test from 'node:test';
import { toDate } from './repository';

/**
 * The conversion that was missing.
 *
 * db.execute returns raw driver values and Drizzle's column mapping does not
 * apply to it, so a timestamp arrives as a string. The query claimed Date,
 * TypeScript believed it, and the first real comparison threw
 * "from.getTime is not a function" on the applications list.
 */
test('a postgres timestamp string becomes a Date', () => {
  const parsed = toDate('2026-09-05 16:59:06.596+00');
  assert.ok(parsed instanceof Date);
  assert.equal(parsed?.toISOString(), '2026-09-05T16:59:06.596Z');
});

test('a Date is passed through rather than rebuilt', () => {
  const original = new Date('2026-09-05T16:59:06.596Z');
  assert.equal(toDate(original), original);
});

test('nothing becomes null rather than an invalid Date', () => {
  // new Date(null) is 1970 and new Date(undefined) is Invalid Date. Either one
  // reaching a comparison produces a wrong answer instead of no answer.
  assert.equal(toDate(null), null);
  assert.equal(toDate(undefined), null);
  assert.equal(toDate(''), null);
  assert.equal(toDate('not a date'), null);
});

test('what comes back can always be compared', () => {
  // The actual requirement: whatever this returns either has getTime or is
  // null, so a caller checking for null is sufficient.
  for (const value of ['2026-09-05 16:59:06.596+00', new Date(), null, undefined, 'rubbish']) {
    const result = toDate(value as never);
    assert.ok(result === null || typeof result.getTime === 'function');
  }
});
