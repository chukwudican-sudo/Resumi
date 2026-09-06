import assert from 'node:assert/strict';
import test from 'node:test';
import { CREDENTIALS, composeDegree, saysCredential } from './degree';

/**
 * The degree line, composed without repeating itself.
 *
 * The case that made this exist is the last one: an entry imported from an
 * uploaded resume holds the whole phrase in its title, and clicking the empty
 * credential chip beside it printed the credential twice.
 */

test('a credential and a field of study read as one phrase', () => {
  assert.equal(
    composeDegree('Bachelor of Engineering', 'Software Engineering'),
    'Bachelor of Engineering in Software Engineering',
  );
});

test('honours follow the degree', () => {
  assert.equal(
    composeDegree('Bachelor of Science', 'Computer Science', "Dean's List"),
    "Bachelor of Science in Computer Science · Dean's List",
  );
});

test('a title that already names the degree is not given another', () => {
  // The live corruption. An imported title carries the whole phrase, and the
  // chip beside it is empty, so filling the chip in is the obvious thing to do.
  assert.equal(
    composeDegree(
      'Bachelor of Engineering',
      "Bachelor of Engineering in Software Engineering · Dean's List",
    ),
    "Bachelor of Engineering in Software Engineering · Dean's List",
  );
});

test('a degree we hold no chip for still blocks the duplication', () => {
  // saysCredential is deliberately wider than CREDENTIALS: the question is
  // whether it would be said twice, not whether we have a chip for it.
  assert.equal(
    composeDegree('Bachelor of Science', 'Doctor of Philosophy in Physics'),
    'Doctor of Philosophy in Physics',
  );
  assert.equal(
    composeDegree('Bachelor of Science', 'BSc Computer Science'),
    'BSc Computer Science',
  );
});

test('either half alone still prints', () => {
  assert.equal(composeDegree(null, 'Software Engineering'), 'Software Engineering');
  assert.equal(composeDegree('Diploma', ''), 'Diploma');
  assert.equal(composeDegree('Diploma', null, 'With Distinction'), 'Diploma · With Distinction');
  assert.equal(composeDegree(null, null), '');
  assert.equal(composeDegree(undefined, undefined, undefined), '');
});

test('whitespace does not become a separator', () => {
  assert.equal(composeDegree('  ', '  Software Engineering  '), 'Software Engineering');
  assert.equal(composeDegree('Bachelor of Arts', 'History', '   '), 'Bachelor of Arts in History');
});

test('a field of study that merely mentions a subject is not a credential', () => {
  // "Engineering" alone must not read as a degree, or every engineering
  // student loses their credential.
  assert.equal(saysCredential('Software Engineering'), false);
  assert.equal(saysCredential('Computer Science'), false);
  assert.equal(saysCredential('Mastering Data Analysis'), false);
  assert.equal(saysCredential(''), false);
  assert.equal(saysCredential(null), false);
});

test('the written forms are recognised as degrees', () => {
  for (const phrase of [
    'Bachelor of Engineering in Software Engineering',
    "Master's in Data Science",
    'Doctor of Philosophy in Physics',
    'BSc Computer Science',
    'B.Eng Mechanical',
    'MEng Robotics',
    'Diploma in Business',
    'Certificate in Accounting',
    'MBA',
  ]) {
    assert.equal(saysCredential(phrase), true, `"${phrase}" names a degree`);
  }
});

test('every chip value is one the guard would recognise', () => {
  // Otherwise a chip could be appended to a title that already carried it.
  for (const credential of CREDENTIALS) {
    assert.equal(saysCredential(credential), true, `${credential} must be recognised`);
  }
});
