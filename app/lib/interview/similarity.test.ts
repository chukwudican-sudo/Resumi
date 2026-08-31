import assert from 'node:assert';
import test from 'node:test';
import { findDuplicate, questionSimilarity, type AskedQuestion } from './similarity';

function q(text: string, entryId: string | null = null): AskedQuestion {
  return { text, entryId, category: 'context' };
}

// Verbatim output from a smoke run before the guard existed: the model asked
// the same enumeration question four ways across seven turns. This is the
// regression the module exists to prevent.
const REPEATS = [
  'Before Northbound, are there other roles, internships, or significant projects you’d want on your resume?',
  'Are there other roles, internships, or notable projects you’d want included — or is Northbound the main thing?',
  'Besides the retry system, are there other roles, internships, or projects — course or personal — you’d want on the resume?',
  'Is there anything else — another project, internship, or course work — you’d want on the resume, or are Northbound and Resumi the main things?',
].map((t) => q(t));

test('every reworded repeat of the enumeration question is caught', () => {
  for (let i = 1; i < REPEATS.length; i += 1) {
    const dup = findDuplicate(REPEATS[i], REPEATS.slice(0, i));
    assert.ok(dup, `variant ${i + 1} should be caught:\n  ${REPEATS[i].text}`);
  }
});

test('singular and plural forms of the same question still match', () => {
  // "projects/internships" vs "project/internship" — the plural mismatch alone
  // previously hid this repeat entirely.
  const plural = q('Are there other projects or internships for the resume?');
  const singular = q('Is there another project or internship for the resume?');

  assert.ok(findDuplicate(singular, [plural]));
});

test('the same question about different entries is NOT a duplicate', () => {
  const payments = q('Roughly how many users did the payments system serve?', 'entry_1');
  const resumi = q('Roughly how many users did Resumi serve?', 'entry_2');

  assert.equal(
    findDuplicate(resumi, [payments]),
    null,
    'sharing a sentence frame across two entries is normal, not a repeat',
  );
});

test('the same question about the SAME entry is a duplicate', () => {
  const first = q('Roughly how many users did the payments system serve?', 'entry_1');
  const reworded = q('Any sense of how many users that payments system served?', 'entry_1');

  assert.ok(findDuplicate(reworded, [first]));
});

test('genuinely different questions are not flagged', () => {
  const asked = [
    q('Do you know roughly how many failed charges were hitting that system per day?'),
    q('What is your name and what is the most recent role you are coming from?'),
  ];
  const fresh = q('What made you decide to build it in the first place?');

  assert.equal(findDuplicate(fresh, asked), null);
});

test('identical text scores 1', () => {
  const text = 'What tools did you use on that project?';
  assert.equal(questionSimilarity(text, text), 1);
});

test('empty or stopword-only input never matches', () => {
  assert.equal(questionSimilarity('', 'anything at all?'), 0);
  assert.equal(questionSimilarity('what about you?', ''), 0);
});

test('findDuplicate returns null against an empty history', () => {
  assert.equal(findDuplicate(q('Any question at all?'), []), null);
});
