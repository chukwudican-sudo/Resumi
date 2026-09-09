import assert from 'node:assert/strict';
import test from 'node:test';
import { joinLevel, levelOptions, splitLevel, LEVELS } from './proficiency';

/** Everything stored must survive the trip out to the boxes and back. */
function roundTrips(value: string) {
  assert.equal(joinLevel(splitLevel(value)), value, `round trip: ${JSON.stringify(value)}`);
}

test('a plain level is just the level', () => {
  assert.deepEqual(splitLevel('Native'), { level: 'Native', note: '' });
  roundTrips('Native');
});

test('a bracketed aside becomes the second box', () => {
  // The exact value the test upload carried.
  assert.deepEqual(splitLevel('Basic (test entry)'), { level: 'Basic', note: 'test entry' });
  roundTrips('Basic (test entry)');
  roundTrips('Conversational (test entry)');
});

test('a level the app does not know is left alone', () => {
  assert.deepEqual(splitLevel('Native / Fluent'), { level: 'Native / Fluent', note: '' });
  roundTrips('Native / Fluent');
});

test('a certificate keeps its own brackets', () => {
  assert.deepEqual(splitLevel('C1 (CEFR)'), { level: 'C1', note: 'CEFR' });
  roundTrips('C1 (CEFR)');
  // Only the trailing aside is taken, so a certificate is not split in half.
  assert.deepEqual(splitLevel('Advanced (DELF B2) (spoken)'), {
    level: 'Advanced (DELF B2)',
    note: 'spoken',
  });
  roundTrips('Advanced (DELF B2) (spoken)');
});

test('nothing at all stays nothing', () => {
  assert.deepEqual(splitLevel(''), { level: '', note: '' });
  assert.deepEqual(splitLevel('   '), { level: '', note: '' });
  assert.equal(joinLevel({ level: '', note: '' }), '');
});

test('a note with no level does not print empty brackets', () => {
  assert.equal(joinLevel({ level: '', note: 'DELF B2' }), 'DELF B2');
});

test('unbalanced brackets are not a split', () => {
  assert.deepEqual(splitLevel('Basic (test'), { level: 'Basic (test', note: '' });
  roundTrips('Basic (test');
  assert.deepEqual(splitLevel('Basic)'), { level: 'Basic)', note: '' });
});

test('brackets with nothing in them are dropped, not kept as a note', () => {
  assert.deepEqual(splitLevel('Basic ()'), { level: 'Basic', note: '' });
  assert.equal(joinLevel(splitLevel('Basic ()')), 'Basic');
});

test('a value that is nothing but brackets is left exactly as written', () => {
  // Splitting it would print "mother tongue" without the brackets somebody
  // typed. Nothing is gained by rewriting their line to fill two boxes.
  assert.deepEqual(splitLevel('(mother tongue)'), { level: '(mother tongue)', note: '' });
  roundTrips('(mother tongue)');
});

test('the picker offers the six, plus whatever is already there', () => {
  assert.deepEqual(levelOptions('Native'), LEVELS);
  assert.deepEqual(levelOptions(''), LEVELS);
  assert.deepEqual(levelOptions('Native / Fluent'), ['Native / Fluent', ...LEVELS]);
  assert.equal(levelOptions('Mother tongue')[0], 'Mother tongue', 'the current value stays selectable');
});

test('every offered level round trips as itself', () => {
  for (const level of LEVELS) roundTrips(level);
});
