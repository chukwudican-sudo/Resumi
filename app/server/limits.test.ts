import assert from 'node:assert';
import test from 'node:test';
import { checkLimits, type Budget, type UsageWindow } from './limits';

const budget: Budget = { globalDailyUsd: 25, userDailyUsd: 2, burstPerMinute: 8 };

function usage(over: Partial<UsageWindow> = {}): UsageWindow {
  return { spentLast24hUsd: 0, userCallsLastMinute: 0, userSpentLast24hUsd: 0, ...over };
}

test('ordinary use is allowed', () => {
  assert.equal(checkLimits(usage({ spentLast24hUsd: 3, userSpentLast24hUsd: 0.4, userCallsLastMinute: 2 }), budget), null);
});

test('the global ceiling stops everyone, including a user who has spent nothing', () => {
  const refusal = checkLimits(usage({ spentLast24hUsd: 25 }), budget);
  assert.ok(refusal, 'expected a refusal at the ceiling');
  assert.match(refusal.userMessage, /at capacity/i);
  // The person being refused did nothing wrong, and the message must not imply
  // they did — this is the difference between "try later" and "you overused".
  assert.doesNotMatch(refusal.userMessage, /you.*(limit|used)/i);
});

test('the ceiling fires exactly at the limit, not one call past it', () => {
  assert.equal(checkLimits(usage({ spentLast24hUsd: 24.99 }), budget), null);
  assert.ok(checkLimits(usage({ spentLast24hUsd: 25 }), budget));
});

test('one account cannot consume the whole global ceiling', () => {
  const refusal = checkLimits(usage({ spentLast24hUsd: 2, userSpentLast24hUsd: 2 }), budget);
  assert.ok(refusal);
  assert.match(refusal.userMessage, /today's limit/i);
});

test('a burst is refused before it becomes expensive', () => {
  assert.equal(checkLimits(usage({ userCallsLastMinute: 7 }), budget), null);
  const refusal = checkLimits(usage({ userCallsLastMinute: 8 }), budget);
  assert.ok(refusal);
  assert.match(refusal.userMessage, /a minute/i);
});

test('an interview is allowed a higher rate than a generation', () => {
  // 20 answers in a minute is beyond human pace but well within a retry loop,
  // which is the thing the limit is actually for.
  const interview: Budget = { ...budget, burstPerMinute: 20 };
  assert.equal(checkLimits(usage({ userCallsLastMinute: 15 }), interview), null);
  assert.ok(checkLimits(usage({ userCallsLastMinute: 15 }), budget), 'same rate refused for a generation');
});

test('the global ceiling is reported before a personal one', () => {
  // Both are breached. The person needs to know it is not about them.
  const refusal = checkLimits(usage({ spentLast24hUsd: 30, userSpentLast24hUsd: 5 }), budget);
  assert.ok(refusal);
  assert.match(refusal.userMessage, /at capacity/i);
});

test('refusals never disclose the budget to the user', () => {
  const refusals = [
    checkLimits(usage({ spentLast24hUsd: 30 }), budget),
    checkLimits(usage({ userSpentLast24hUsd: 5 }), budget),
    checkLimits(usage({ userCallsLastMinute: 40 }), budget),
  ];
  for (const refusal of refusals) {
    assert.ok(refusal);
    // The internal message carries the figures for the log; the user-facing one
    // must not, or the limits become something to probe.
    assert.doesNotMatch(refusal.userMessage, /\$|\d+\s*(usd|calls)/i);
    assert.ok(refusal.retryable, 'every limit here clears with time');
  }
});
