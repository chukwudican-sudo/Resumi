import assert from 'node:assert';
import test from 'node:test';
import { shouldPrint, splitEmployment, titleWithEmployment } from './employment';

test('full-time is never printed, because it is what a reader already assumes', () => {
  assert.equal(shouldPrint('Full-time'), false);
  assert.equal(titleWithEmployment('Wealth Manager', 'Full-time'), 'Wealth Manager');
});

test('the types that explain something are printed', () => {
  assert.equal(titleWithEmployment('AI Engineer', 'Part-time'), 'AI Engineer (Part-time)');
  assert.equal(titleWithEmployment('Backend Developer', 'Internship'), 'Backend Developer (Internship)');
  assert.equal(titleWithEmployment('Designer', 'Contract'), 'Designer (Contract)');
});

test('nothing is said twice', () => {
  assert.equal(titleWithEmployment('AI Engineer (Part-time)', 'Part-time'), 'AI Engineer (Part-time)');
});

test('an unset or unrecognised type prints nothing', () => {
  assert.equal(titleWithEmployment('Engineer', null), 'Engineer');
  assert.equal(titleWithEmployment('Engineer', ''), 'Engineer');
  assert.equal(titleWithEmployment('Engineer', 'Something Else'), 'Engineer');
});

test('a job type typed into the title is lifted out of it', () => {
  assert.deepEqual(splitEmployment('Operations & Client Engagement (Full-Time)'), {
    title: 'Operations & Client Engagement',
    employment: 'Full-time',
  });
  assert.deepEqual(splitEmployment('Backend Developer (Intern)'), {
    title: 'Backend Developer',
    employment: 'Internship',
  });
});

test('a description of the role is not a job type and survives', () => {
  // The line this whole module has to hold. Stripping this would delete
  // something the person deliberately wrote.
  assert.deepEqual(splitEmployment('Wealth Manager (Client Services & Financial Planning)'), {
    title: 'Wealth Manager (Client Services & Financial Planning)',
    employment: null,
  });
  assert.deepEqual(splitEmployment('Engineer (Platform)'), {
    title: 'Engineer (Platform)',
    employment: null,
  });
});

test('spacing and hyphens people actually use are recognised', () => {
  for (const written of ['Full Time', 'full-time', 'FULLTIME']) {
    assert.equal(splitEmployment(`Manager (${written})`).employment, 'Full-time', written);
  }
  assert.equal(splitEmployment('Student (Co-op)').employment, 'Co-op');
});

test('a title left empty by stripping does not keep the spacing', () => {
  assert.equal(splitEmployment('Analyst  (Contract)').title, 'Analyst');
});
