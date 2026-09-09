import assert from 'node:assert/strict';
import test from 'node:test';
import { readableText } from './proofread';
import type { ResumeStructure } from './types';

/**
 * What the spellchecker is allowed to see.
 *
 * Two failures, opposite directions. It used to be handed a fixed five — name,
 * skills, education, experience, projects — so a certifications section went to
 * print carrying "Creditial Id 1000" and "Torojjto, ON" twice each; the model
 * did not miss them, it was never shown them. And a first attempt at fixing
 * that swapped education's location for its dates, which is worse: a date looks
 * misspelled to any spellchecker and a "correction" landing on one corrupts it.
 */
const RESUME: ResumeStructure = {
  name: 'Chukwudi Alex',
  contact: { email: 'a@b.com' },
  summary: 'Seeking a Software Enginering co-op.',
  education: [{ school: 'Ontario Tech University', location: 'Oshawa, ON', degree: 'BEng', dates: 'Sep 2023 – 2028' }],
  experience: [{ title: 'Software Engineer', org: 'Droady', location: 'San Francisco, CA', dates: 'Nov 2025 – May 2026', bullets: ['Shipped it'] }],
  projects: [{ name: 'Resumi', tech: 'Next.js', dates: 'Jun 2026', bullets: ['Built it'], url: 'github.com/x/y' }],
  skills: [{ category: 'Tools', items: 'Git, Vercel' }],
  sections: [
    { key: 'summary', label: 'Objective', shape: 'prose', text: 'Seeking a Software Enginering co-op.' },
    { key: 'education', label: 'Education' },
    {
      key: 'certifications',
      label: 'Certifications',
      shape: 'entries',
      entries: [{
        title: 'Microsoft Certified: Azure Fundamentals (AZ-900)',
        org: 'Microsoft',
        location: 'Torojjto, ON',
        dates: 'Jun 2027 – May 2029',
        bullets: ['Creditial Id 1000'],
      }],
    },
    { key: 'languages', label: 'Languages', shape: 'groups', groups: [{ category: 'English', items: 'Natve' }] },
    { key: 'interests', label: 'Interests', shape: 'list', items: ['Chess', 'Long-distance runing'] },
    { key: 'skills', label: 'Technical Skills' },
  ],
};

const text = readableText(RESUME, RESUME.name);

test('every section a person has is shown to the spellchecker', () => {
  for (const typo of ['Creditial', 'Torojjto', 'Enginering', 'Natve', 'runing']) {
    assert.ok(text.includes(typo), `${typo} must be visible`);
  }
});

test('the five it always read are still read the same way', () => {
  assert.ok(text.includes('Oshawa, ON'), "education's location");
  assert.ok(text.includes('San Francisco, CA'), "experience's location");
  assert.ok(text.includes('Tools: Git, Vercel'), 'skills');
  assert.ok(text.includes('Chukwudi Alex'), 'the name');
});

test('dates are never shown to it', () => {
  // "Sep 2023 – 2028" looks misspelled to a spellchecker, and a correction
  // landing on a date is worse than the typo it was chasing.
  for (const date of ['Sep 2023', 'Nov 2025', 'Jun 2026', 'Jun 2027', 'May 2029']) {
    assert.ok(!text.includes(date), `${date} must be hidden`);
  }
});

test('links are never shown to it', () => {
  // "Fixing" an address produces a dead link.
  assert.ok(!text.includes('github.com'));
});

test('a section with nothing in it is not announced', () => {
  const bare: ResumeStructure = {
    ...RESUME,
    summary: '',
    sections: [{ key: 'summary', label: 'Objective', shape: 'prose', text: '' }],
  };
  assert.ok(!readableText(bare).includes('OBJECTIVE'));
});

test('each section is announced by the name the person gave it', () => {
  assert.ok(text.includes('OBJECTIVE'), 'not SUMMARY');
  assert.ok(text.includes('CERTIFICATIONS'));
  assert.ok(text.includes('LANGUAGES'));
});
