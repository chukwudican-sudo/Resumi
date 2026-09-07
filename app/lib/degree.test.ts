import assert from 'node:assert/strict';
import test from 'node:test';
import { CREDENTIALS, composeDegree, saysCredential, splitDegree } from './degree';

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

// ── Taking a written degree apart ──────────────────────────────────────────

test('the whole phrase splits into the three boxes the form has', () => {
  assert.deepEqual(splitDegree("Bachelor of Engineering in Software Engineering · Dean's List"), {
    title: 'Software Engineering',
    credential: 'Bachelor of Engineering',
    honours: "Dean's List",
  });
});

test('shorthand becomes the value the chip carries', () => {
  // Otherwise the chip cannot highlight, which is the bug being fixed.
  assert.deepEqual(splitDegree('BEng Software Engineering'), {
    title: 'Software Engineering', credential: 'Bachelor of Engineering', honours: null,
  });
  assert.deepEqual(splitDegree('B.Eng. in Software Engineering'), {
    title: 'Software Engineering', credential: 'Bachelor of Engineering', honours: null,
  });
  assert.deepEqual(splitDegree('BSc Computer Science'), {
    title: 'Computer Science', credential: 'Bachelor of Science', honours: null,
  });
  assert.deepEqual(splitDegree('MSc, Data Science'), {
    title: 'Data Science', credential: 'Master of Science', honours: null,
  });
  assert.deepEqual(splitDegree('BA in Psychology'), {
    title: 'Psychology', credential: 'Bachelor of Arts', honours: null,
  });
});

test('a longer degree name is not torn in half', () => {
  // "Bachelor of Engineering Technology" is not a Bachelor of Engineering in
  // Technology. Splitting it would rename somebody's degree.
  assert.deepEqual(splitDegree('Bachelor of Engineering Technology in Electrical'), {
    title: 'Bachelor of Engineering Technology in Electrical', credential: null, honours: null,
  });
});

test('a credential we hold no chip for stays in the title', () => {
  // extra.credential has no free-text field, so text put there would be
  // invisible in the form — the same class of bug being fixed.
  for (const phrase of ['Doctor of Philosophy in Physics', 'Honours Bachelor of Computer Science']) {
    const split = splitDegree(phrase);
    assert.equal(split.credential, null, phrase);
    assert.equal(split.title, phrase, phrase);
  }
});

test('a field of study is not mistaken for a prize', () => {
  assert.deepEqual(splitDegree('Bachelor of Science, Computer Science'), {
    title: 'Computer Science', credential: 'Bachelor of Science', honours: null,
  });
  assert.equal(splitDegree('BSc Computer Science, Minor in Mathematics').honours, null);
  assert.equal(splitDegree('BSc Computer Science, Summa Cum Laude').honours, 'Summa Cum Laude');
});

test('a GPA is left exactly where it was written', () => {
  // Nothing renders extra.gpa, so lifting it out would delete it.
  const split = splitDegree('BSc Computer Science, GPA: 3.9');
  assert.equal(split.honours, null);
  assert.ok(split.title.includes('GPA: 3.9'), 'the GPA must survive somewhere visible');
});

test('an empty degree splits into nothing', () => {
  assert.deepEqual(splitDegree(''), { title: '', credential: null, honours: null });
  assert.deepEqual(splitDegree(null), { title: '', credential: null, honours: null });
});

test('splitting and composing restate the original', () => {
  for (const original of [
    "Bachelor of Engineering in Software Engineering · Dean's List",
    'Bachelor of Science in Computer Science',
    'Doctor of Philosophy in Physics',
    'Bachelor of Engineering Technology in Electrical',
  ]) {
    const { title, credential, honours } = splitDegree(original);
    assert.equal(composeDegree(credential, title, honours), original, original);
  }
});

test('a split degree cannot be doubled by the chip it produced', () => {
  // The two halves have to agree: whatever splitDegree puts in the title must
  // not trip composeDegree's guard, or the credential vanishes instead.
  const { title, credential, honours } = splitDegree(
    "Bachelor of Engineering in Software Engineering · Dean's List",
  );
  assert.equal(
    composeDegree(credential, title, honours),
    "Bachelor of Engineering in Software Engineering · Dean's List",
  );
});

test('a GPA someone typed actually reaches the resume', () => {
  // It was collected by the editor and rendered nowhere, so it silently went
  // into the database and never onto the page.
  assert.equal(
    composeDegree('Bachelor of Science', 'Computer Science', null, '3.9 / 4.0'),
    'Bachelor of Science in Computer Science · GPA 3.9 / 4.0',
  );
  // Not labelled twice by someone who typed the label themselves.
  assert.equal(
    composeDegree(null, 'Computer Science', null, 'GPA: 3.9'),
    'Computer Science · GPA: 3.9',
  );
  assert.equal(
    composeDegree('Bachelor of Arts', 'History', 'Dean’s List', '3.8'),
    'Bachelor of Arts in History · GPA 3.8 · Dean’s List',
  );
  assert.equal(composeDegree('Bachelor of Arts', 'History', null, '   '), 'Bachelor of Arts in History');
});
