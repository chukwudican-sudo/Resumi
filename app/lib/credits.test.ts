import assert from 'node:assert';
import test from 'node:test';
import { creditsLabel, isDue, MONTHLY_CREDITS, nextReset } from './credits';

test('the reset lands on the first of next month', () => {
  assert.equal(nextReset(new Date('2026-09-05T14:00:00Z')).toISOString(), '2026-10-01T00:00:00.000Z');
  assert.equal(nextReset(new Date('2026-09-01T00:00:00Z')).toISOString(), '2026-10-01T00:00:00.000Z');
});

test('December rolls into January of the next year', () => {
  assert.equal(nextReset(new Date('2026-12-20T09:00:00Z')).toISOString(), '2027-01-01T00:00:00.000Z');
});

test('a month is due once its date has passed', () => {
  const now = new Date('2026-09-05T12:00:00Z');
  assert.equal(isDue(new Date('2026-10-01T00:00:00Z'), now), false, 'still this month');
  assert.equal(isDue(new Date('2026-09-01T00:00:00Z'), now), true, 'last month');
  assert.equal(isDue(new Date('2026-09-05T12:00:00Z'), now), true, 'exactly now counts');
});

test('an account that predates any of this starts a fresh month', () => {
  // Everyone signed up before resets existed has no date on their row. Reading
  // that as "not due" would leave them stuck on whatever they had left, which
  // is the bug this whole thing exists to fix.
  assert.equal(isDue(null), true);
  assert.equal(isDue(undefined), true);
});

test('the count reads plainly at every number', () => {
  assert.equal(creditsLabel(MONTHLY_CREDITS), '10 of 10 free left');
  assert.equal(creditsLabel(2), '2 of 10 free left');
  assert.equal(creditsLabel(1), '1 application left');
  assert.equal(creditsLabel(0), 'No applications left');
  assert.equal(creditsLabel(-1), 'No applications left', 'never reads as a negative');
});
