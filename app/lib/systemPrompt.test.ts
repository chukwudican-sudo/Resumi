import assert from 'node:assert';
import test from 'node:test';
import { TAILOR_INVARIANT, buildUserContext } from './systemPrompt';

test('the cached prefix names nobody', () => {
  // Every user shares this block. A name in it means each person becomes their
  // own cache entry for the largest part of the request — and it means someone
  // else's name is in the prompt describing this person's resume.
  assert.doesNotMatch(TAILOR_INVARIANT, /Alex|Ndubuisi/i);
  // Nor a nationality, since spelling is a per-user decision.
  assert.doesNotMatch(TAILOR_INVARIANT, /Canadian|Canada/i);
  // Nor a pronoun for the person, whose pronouns the app does not know.
  assert.doesNotMatch(TAILOR_INVARIANT, /\b(his|her|he|she)\b/i);
});

test('an American applicant is told to use American spelling', () => {
  const context = buildUserContext({ displayName: 'Dana Whitfield', locale: 'en-US' });
  assert.match(context, /American English/);
  assert.match(context, /color, program, license, organize/);
  assert.doesNotMatch(context, /organise/);
});

test('a Canadian applicant still gets Canadian spelling', () => {
  const context = buildUserContext({ displayName: 'Alex Ndubuisi', locale: 'en-CA' });
  assert.match(context, /Canadian English/);
  assert.match(context, /colour, programme, licence, organise/);
});

test('an unknown or missing locale falls back rather than dropping the instruction', () => {
  // Silence here would mean whatever the model felt like, which is worse than a
  // default someone can correct.
  for (const locale of [undefined, null, 'xx-YY', '']) {
    const context = buildUserContext({ displayName: 'Sam', locale });
    assert.match(context, /English spelling/, `no spelling instruction for locale ${String(locale)}`);
  }
});

test('the resume belongs to whoever is named', () => {
  assert.match(buildUserContext({ displayName: 'Dana Whitfield' }), /Dana Whitfield/);
  // No name is a normal state, not a reason to guess one.
  const anonymous = buildUserContext({ displayName: null });
  assert.doesNotMatch(anonymous, /null|undefined/);
  assert.match(anonymous, /this person/i);
});

test("personal rules are numbered and ranked below the universal ones", () => {
  const context = buildUserContext({
    displayName: 'Sam',
    locale: 'en-CA',
    rules: [{ text: 'Never use the word "spearheaded".' }, { text: 'Call it Ontario Tech, never UOIT.' }],
  });
  assert.match(context, /1\. Never use the word "spearheaded"\./);
  assert.match(context, /2\. Call it Ontario Tech, never UOIT\./);
  // The ranking has to be stated, or a personal rule can be read as licence to
  // break rule 1 and invent something.
  assert.match(context, /below the Universal Rules/i);
});

test('blank rules do not become empty numbered lines', () => {
  const context = buildUserContext({ rules: [{ text: '   ' }, { text: 'Keep bullets to one line.' }] });
  assert.match(context, /1\. Keep bullets to one line\./);
  assert.doesNotMatch(context, /2\./);
});

test('no rules means no rules section at all', () => {
  // An empty heading reads as a feature that failed to load.
  const context = buildUserContext({ displayName: 'Sam', rules: [] });
  assert.doesNotMatch(context, /OWN RULES/);
});
