import assert from 'node:assert';
import test from 'node:test';
import { cleanWarning } from './compose';

// Verbatim from a real run: internal ids reached the screen.
test('internal ids never survive into a user-facing warning', () => {
  const raw =
    'Kudi Kitchen storefront bullet references fact_mti50jsc00 (hand-coded, no framework), which was inferred from fact_mti50jsc23 and context facts — double-check the cited ids are correct in your system.';
  const cleaned = cleanWarning(raw);

  assert.ok(!/fact_[A-Za-z0-9]+/.test(cleaned), `id leaked: ${cleaned}`);
  assert.ok(!/entry_[A-Za-z0-9]+/.test(cleaned));
});

test('entry and turn ids are stripped too', () => {
  assert.ok(!/entry_/.test(cleanWarning('entry_abc12 has no metric')));
  assert.ok(!/turn_/.test(cleanWarning('recorded in turn_xyz99')));
});

test('a clean warning is left alone', () => {
  const good = 'Two of your roles have overlapping dates — confirm they were concurrent.';
  assert.equal(cleanWarning(good), good);
});

test('parenthetical citations are removed', () => {
  const cleaned = cleanWarning('The storefront bullet (inferred from several facts) may be mixing two things.');
  assert.ok(!cleaned.includes('inferred from'));
  assert.ok(cleaned.includes('may be mixing two things'));
});
