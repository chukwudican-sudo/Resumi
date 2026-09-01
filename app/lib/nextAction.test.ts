import assert from 'node:assert';
import test from 'node:test';
import { nextAction, type NextActionInput } from './nextAction';

const NOW = new Date('2026-09-01T12:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

function input(over: Partial<NextActionInput> = {}): NextActionInput {
  return {
    status: 'draft',
    appliedAt: null,
    followUpDueAt: null,
    closesAt: null,
    hasResume: true,
    ...over,
  };
}

test('a closed application owes nothing', () => {
  assert.equal(nextAction(input({ status: 'rejected' }), NOW).label, '—');
  assert.equal(nextAction(input({ status: 'rejected' }), NOW).urgent, false);
  assert.equal(nextAction(input({ status: 'withdrawn' }), NOW).label, '—');
});

test('an overdue follow-up is urgent and says how long it has been', () => {
  const result = nextAction(
    input({ status: 'applied', appliedAt: days(-8), followUpDueAt: days(-1) }),
    NOW,
  );
  assert.equal(result.label, 'Follow up — 8 days');
  assert.equal(result.urgent, true);
});

test('a recent application is not urgent', () => {
  const result = nextAction(input({ status: 'applied', appliedAt: days(-3), followUpDueAt: days(4) }), NOW);
  assert.equal(result.label, 'Applied 3 days ago');
  assert.equal(result.urgent, false);
});

test('a deadline inside a week is urgent', () => {
  assert.equal(nextAction(input({ closesAt: days(3) }), NOW).urgent, true);
  assert.equal(nextAction(input({ closesAt: days(3) }), NOW).label, 'Closes in 3 days');
});

test('a distant deadline is not urgent', () => {
  const result = nextAction(input({ closesAt: days(30) }), NOW);
  assert.equal(result.label, 'Closes in 30 days');
  assert.equal(result.urgent, false);
});

test('closing today is urgent and reads as today', () => {
  assert.deepEqual(nextAction(input({ closesAt: NOW }), NOW), { label: 'Closes today', urgent: true });
});

test('a passed deadline is closed, not urgent', () => {
  assert.deepEqual(nextAction(input({ closesAt: days(-2) }), NOW), { label: 'Closed', urgent: false });
});

test('an unsent draft with no deadline is not urgent — not sending yet is fine', () => {
  assert.deepEqual(nextAction(input(), NOW), { label: 'Not sent', urgent: false });
});

test('a draft with no resume says so', () => {
  assert.equal(nextAction(input({ hasResume: false }), NOW).label, 'No resume yet');
});

test('singular days read correctly', () => {
  assert.equal(nextAction(input({ closesAt: days(1) }), NOW).label, 'Closes in 1 day');
  assert.equal(
    nextAction(input({ status: 'applied', appliedAt: days(-1), followUpDueAt: days(-1) }), NOW).label,
    'Follow up — 1 day',
  );
});
