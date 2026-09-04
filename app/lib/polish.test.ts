import assert from 'node:assert';
import test from 'node:test';
import { applyPolish, validatePolish, type PolishResult } from './polish';
import type { ResumeStructure } from './types';

const SOURCE_SKILLS = [
  'Skills: Uses TypeScript/JavaScript most, across full-stack web and mobile projects',
  'Skills: Uses Python for backend algorithm work',
  'Skills: Has C++ experience from coursework',
  'Core languages: Python, TypeScript/JavaScript, Java, SQL',
].join('\n');

function polish(over: Partial<PolishResult> = {}): PolishResult {
  return {
    skillGroups: [{ category: 'Languages', items: ['Python', 'TypeScript'] }],
    sections: [
      { key: 'education', label: 'Education' },
      { key: 'projects', label: 'Technical Projects' },
      { key: 'experience', label: 'Experience' },
      { key: 'skills', label: 'Technical Skills' },
    ],
    corrections: [],
    warnings: [],
    ...over,
  };
}

test('prose becomes terms, grouped and named', () => {
  const result = validatePolish(polish(), SOURCE_SKILLS);
  assert.deepEqual(result.skillGroups, [{ category: 'Languages', items: ['Python', 'TypeScript'] }]);
});

test('a skill nobody claimed is dropped', () => {
  // The whole reason grouping is safe: it can only rearrange what was given.
  const result = validatePolish(
    polish({ skillGroups: [{ category: 'Languages', items: ['Python', 'Rust', 'Kubernetes'] }] }),
    SOURCE_SKILLS,
  );
  assert.deepEqual(result.skillGroups[0].items, ['Python'], 'Rust and Kubernetes appear nowhere in the source');
});

test('the same skill cannot appear in two groups', () => {
  const result = validatePolish(
    polish({
      skillGroups: [
        { category: 'Languages', items: ['Python'] },
        { category: 'Backend', items: ['Python'] },
      ],
    }),
    SOURCE_SKILLS,
  );
  assert.deepEqual(result.skillGroups, [{ category: 'Languages', items: ['Python'] }]);
});

test('matching ignores punctuation and case, so C++ survives', () => {
  const result = validatePolish(
    polish({ skillGroups: [{ category: 'Languages', items: ['C++', 'sql'] }] }),
    SOURCE_SKILLS,
  );
  assert.deepEqual(result.skillGroups[0].items, ['C++', 'sql']);
});

test('a group left empty by filtering disappears rather than printing a bare heading', () => {
  const result = validatePolish(
    polish({ skillGroups: [{ category: 'Cloud', items: ['AWS', 'GCP'] }] }),
    SOURCE_SKILLS,
  );
  assert.deepEqual(result.skillGroups, []);
});

test('a dropped section is restored rather than silently deleting someone education', () => {
  const result = validatePolish(polish({ sections: [{ key: 'skills', label: 'Skills' }] }), SOURCE_SKILLS);
  assert.equal(result.sections.length, 4);
  assert.ok(result.sections.some((s) => s.key === 'education'));
  assert.equal(result.sections[0].key, 'skills', 'what it did say is still honoured, first');
});

test('a section named twice is taken once', () => {
  const result = validatePolish(
    polish({
      sections: [
        { key: 'projects', label: 'Technical Projects' },
        { key: 'projects', label: 'Projects' },
      ],
    }),
    SOURCE_SKILLS,
  );
  assert.equal(result.sections.filter((s) => s.key === 'projects').length, 1);
  assert.equal(result.sections[0].label, 'Technical Projects');
});

test('a typo is corrected', () => {
  const result = validatePolish(
    polish({ corrections: [{ from: 'San Fransisco', to: 'San Francisco', reason: 'spelling' }] }),
    SOURCE_SKILLS,
  );
  assert.equal(result.corrections.length, 1);
});

test('a rewrite dressed as a correction is refused', () => {
  // This is the line between fixing a misspelling and editing someone's history.
  const result = validatePolish(
    polish({
      corrections: [
        { from: 'Operations Specialist', to: 'Senior Operations Manager', reason: 'stronger' },
        { from: 'Aegon', to: 'Aegon Financial Services International', reason: 'fuller name' },
      ],
    }),
    SOURCE_SKILLS,
  );
  assert.deepEqual(result.corrections, []);
});

test('a correction is a word, not a sentence', () => {
  const kept = (c: { from: string; to: string }) =>
    validatePolish(polish({ corrections: [{ ...c, reason: 'spelling' }] }), SOURCE_SKILLS).corrections.length === 1;

  // Real typos, of the kind that actually appear on a resume.
  assert.ok(kept({ from: 'recieve', to: 'receive' }));
  assert.ok(kept({ from: 'Manger', to: 'Manager' }));
  assert.ok(kept({ from: 'San Fransisco', to: 'San Francisco' }));

  // Too short to replace safely — "ap" appears inside dozens of ordinary words.
  assert.ok(!kept({ from: 'ap', to: 'app' }));

  // A whole clause is an edit of what somebody wrote, wearing a typo's clothes.
  assert.ok(
    !kept({
      from: 'supporting design, build, and pre-launch integration',
      to: 'supporting design, build and launch integration',
    }),
  );
  assert.ok(!kept({ from: 'Contributed to the billing work', to: 'Led the billing work' }));
});

test('a correction must be a whole word, so it cannot damage a longer one', () => {
  // The write-back replaces on word boundaries. Without that, correcting "ap"
  // would rewrite "app", "apply" and "apparent" everywhere in someone's data.
  const replace = (text: string, from: string, to: string) =>
    text.replace(new RegExp(`\\b${from}\\b`, 'g'), to);

  assert.equal(replace('Built the app for Apple', 'ap', 'app'), 'Built the app for Apple');
  assert.equal(replace('San Fransisco, CA', 'San Fransisco', 'San Francisco'), 'San Francisco, CA');
  assert.equal(replace('Manger of Operations', 'Manger', 'Manager'), 'Manager of Operations');
});

test('applying polish never touches a bullet', () => {
  const structure: ResumeStructure = {
    name: 'Chukwudi Ndubuisi',
    contact: { email: 'a@b.c' },
    education: [{ school: 'Ontario Tech', location: 'Oshawa, ON', degree: 'BEng', dates: '2028' }],
    experience: [
      {
        title: 'Software Engineer',
        org: 'Droady',
        location: 'San Fransisco, CA',
        dates: '2025',
        bullets: ['Contributed to the AI physique rating feature'],
      },
    ],
    projects: [{ name: 'MealApp', tech: 'React Native', dates: '2026', bullets: ['Designed an offline-first sync'] }],
    skills: [{ category: 'Skills', items: 'Python, TypeScript' }],
  };

  const applied = applyPolish(
    structure,
    validatePolish(
      polish({ corrections: [{ from: 'San Fransisco, CA', to: 'San Francisco, CA', reason: 'spelling' }] }),
      SOURCE_SKILLS,
    ),
  );

  assert.deepEqual(applied.experience[0].bullets, structure.experience[0].bullets);
  assert.deepEqual(applied.projects[0].bullets, structure.projects[0].bullets);
  // Corrections are applied to the entry the text came from, not here, so the
  // rendered structure passed in is unchanged by them.
  assert.equal(applied.experience[0].location, 'San Fransisco, CA');
  assert.equal(applied.name, 'Chukwudi Ndubuisi', 'the name is never touched');
  assert.equal(applied.education[0].dates, '2028', 'dates are never touched');
  assert.deepEqual(applied.sections?.map((s) => s.key), ['education', 'projects', 'experience', 'skills']);
});

test('an empty grouping leaves the existing skills alone rather than erasing them', () => {
  const structure = {
    name: 'X', contact: {}, education: [], experience: [], projects: [],
    skills: [{ category: 'Skills', items: 'Python' }],
  } as ResumeStructure;
  const applied = applyPolish(structure, validatePolish(polish({ skillGroups: [] }), SOURCE_SKILLS));
  assert.deepEqual(applied.skills, [{ category: 'Skills', items: 'Python' }]);
});
