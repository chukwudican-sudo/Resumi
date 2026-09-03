import assert from 'node:assert';
import test from 'node:test';
import { checkReadiness } from './readiness';
import type { ResumeStructure } from './types';

function resume(over: Partial<ResumeStructure> = {}): ResumeStructure {
  return {
    name: 'Chukwudi Ndubuisi',
    contact: { email: 'chukwudi.can@gmail.com', phone: '905-922-5891', github: 'github.com/chukwudican-sudo' },
    education: [
      {
        school: 'Ontario Tech University',
        location: 'Oshawa, ON',
        degree: 'Bachelor of Engineering in Software Engineering',
        dates: 'Sep 2023 – May 2028 (Expected)',
        bullets: ['Relevant Coursework: Data Structures, Algorithms'],
      },
    ],
    experience: [
      {
        title: 'Software Engineer',
        org: 'Droady',
        location: 'San Francisco, CA',
        dates: 'Nov 2025 – May 2026',
        bullets: ['Integrated an AI/LLM model into a production mobile app'],
      },
    ],
    projects: [
      { name: 'MealApp', tech: 'React Native', dates: 'May 2026 – Present', bullets: ['Designed an offline-first sync'] },
    ],
    skills: [{ category: 'Languages', items: 'TypeScript, Python, Java' }],
    ...over,
  };
}

test('a complete resume is ready with nothing to say', () => {
  const result = checkReadiness(resume());
  assert.deepEqual(result.blocking, []);
  assert.equal(result.ready, true);
  assert.deepEqual(result.warnings, [], 'a good resume should not be nagged at');
});

test('an entry with no bullets blocks, because it prints as a heading over nothing', () => {
  const result = checkReadiness(
    resume({ experience: [{ ...resume().experience[0], bullets: [] }] }),
  );
  assert.equal(result.ready, false);
  assert.match(result.blocking[0].message, /Software Engineer at Droady/);
  assert.equal(result.blocking[0].section, 'experience');
});

test('bullets that are only whitespace count as none', () => {
  const result = checkReadiness(resume({ projects: [{ ...resume().projects[0], bullets: ['   ', ''] }] }));
  assert.equal(result.ready, false);
});

test('an entry with no dates blocks, because it cannot be placed in a history', () => {
  const result = checkReadiness(resume({ experience: [{ ...resume().experience[0], dates: '' }] }));
  assert.equal(result.ready, false);
  assert.match(result.blocking[0].message, /no dates/);
});

test('no name and no email block', () => {
  const result = checkReadiness(resume({ name: '', contact: {} }));
  assert.equal(result.blocking.filter((b) => b.section === 'contact').length, 2);
});

test('a resume with nothing done on it blocks', () => {
  const result = checkReadiness(resume({ experience: [], projects: [] }));
  assert.ok(result.blocking.some((b) => /at least one thing you have done/.test(b.message)));
});

test('a missing link is a warning, never a block', () => {
  // Real deadlines beat a perfect resume. This should nudge, not refuse.
  const result = checkReadiness(resume({ contact: { email: 'a@b.c', phone: '905-922-5891' } }));
  assert.equal(result.ready, true);
  assert.ok(result.warnings.some((w) => /GitHub or a portfolio/.test(w.message)));
});

test('a field of study with no credential is a warning that shows the fix', () => {
  const result = checkReadiness(
    resume({ education: [{ ...resume().education[0], degree: 'Software Engineering' }] }),
  );
  assert.equal(result.ready, true, 'this is weak, not broken');
  assert.ok(result.warnings.some((w) => /Bachelor of Engineering in Software Engineering/.test(w.message)));
});

test('a degree with no degree at all blocks', () => {
  const result = checkReadiness(resume({ education: [{ ...resume().education[0], degree: '' }] }));
  assert.equal(result.ready, false);
});

test('skills written as sentences are flagged but do not block', () => {
  const result = checkReadiness(
    resume({
      skills: [{ category: 'Skills', items: 'Uses TypeScript/JavaScript most, across full-stack web and mobile projects' }],
    }),
  );
  assert.equal(result.ready, true);
  assert.ok(result.warnings.some((w) => w.section === 'skills'));
});

test('no skills at all blocks — it is the section screens read first', () => {
  const result = checkReadiness(resume({ skills: [] }));
  assert.equal(result.ready, false);
});

test('every issue names a section, so the message can point somewhere', () => {
  const result = checkReadiness(resume({ name: '', experience: [], projects: [], skills: [], education: [] }));
  for (const issue of [...result.blocking, ...result.warnings]) {
    assert.ok(issue.section, `"${issue.message}" has nowhere to send them`);
    assert.ok(issue.message.trim().length > 0);
  }
});
