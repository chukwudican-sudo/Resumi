import assert from 'node:assert';
import test from 'node:test';
import { applyPolish, overlapNote, validatePolish, type PolishResult } from './polish';
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

test('a malformed response cannot crash the page', () => {
  // What the tool schema asks for and what comes back are different things,
  // especially on unusual input. One warning returned as a bare string used to
  // reach React and throw "warnings.map is not a function" at someone who was
  // only adding skills.
  const wrong = [
    { warnings: 'Your dates overlap.' },
    { warnings: null },
    { warnings: { text: 'nope' } },
    { skillGroups: 'Languages: Python' },
    { skillGroups: null },
    { sections: 'education' },
    { corrections: 'San Fransisco -> San Francisco' },
    { corrections: [null, 'nope', { from: 'x' }] },
    { skillGroups: [{ category: 'Languages', items: 'Python, Java' }] },
    { skillGroups: [null, { items: ['Python'] }] },
  ];

  for (const shape of wrong) {
    const result = validatePolish({ ...polish(), ...shape } as PolishResult, SOURCE_SKILLS);
    assert.ok(Array.isArray(result.warnings), `warnings not a list for ${JSON.stringify(shape)}`);
    assert.ok(Array.isArray(result.corrections), `corrections not a list for ${JSON.stringify(shape)}`);
    assert.ok(Array.isArray(result.skillGroups), `skillGroups not a list for ${JSON.stringify(shape)}`);
    assert.ok(Array.isArray(result.sections), `sections not a list for ${JSON.stringify(shape)}`);
    // Every section still accounted for, however mangled the answer was.
    assert.equal(result.sections.length, 4);
    for (const g of result.skillGroups) assert.ok(Array.isArray(g.items));
  }
});

test('an entirely empty response still produces something renderable', () => {
  const result = validatePolish({} as PolishResult, SOURCE_SKILLS);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.corrections, []);
  assert.deepEqual(result.skillGroups, []);
  assert.equal(result.sections.length, 4, 'the conventional order stands in');
});

function withRoles(roles: { title: string; org: string; dates: string }[]): ResumeStructure {
  return {
    name: 'X', contact: {}, education: [], projects: [], skills: [],
    experience: roles.map((r) => ({ ...r, location: '', bullets: ['did a thing'] })),
  };
}

test('roles that do not overlap are not reported as overlapping', () => {
  // The model claimed May 2025 – Aug 2026 overlapped Jun 2024 – Jan 2025. It
  // does not. Date comparison should not be a judgement call.
  const note = overlapNote(
    withRoles([
      { title: 'Wealth Manager', org: 'Aegon', dates: 'May 2025 – Aug 2026' },
      { title: 'Operations Specialist', org: 'WesternBell', dates: 'Jun 2024 – Jan 2025' },
    ]),
  );
  assert.match(note, /none that need raising/);
});

test('two full-time roles at the same time are reported', () => {
  const note = overlapNote(
    withRoles([
      { title: 'Engineer', org: 'A', dates: 'Jan 2024 – Dec 2025' },
      { title: 'Analyst', org: 'B', dates: 'Jun 2024 – Mar 2025' },
    ]),
  );
  assert.match(note, /Raise this once/);
  assert.match(note, /Engineer at A/);
});

test('an overlap the page already explains is not reported', () => {
  // This is the whole point: holding a part-time job alongside a full-time one
  // is ordinary, and the resume has already said so.
  const note = overlapNote(
    withRoles([
      { title: 'Wealth Manager', org: 'Aegon', dates: 'May 2025 – Aug 2026' },
      { title: 'Software Engineer (Part-time)', org: 'Droady', dates: 'Nov 2025 – May 2026' },
    ]),
  );
  assert.match(note, /none that need raising/);
});

test('a role still running counts as overlapping what follows it', () => {
  const note = overlapNote(
    withRoles([
      { title: 'Engineer', org: 'A', dates: 'Jan 2024 – Present' },
      { title: 'Analyst', org: 'B', dates: 'Jun 2025 – Dec 2025' },
    ]),
  );
  assert.match(note, /Raise this once/);
});

test('a year with no month still compares', () => {
  const note = overlapNote(
    withRoles([
      { title: 'Engineer', org: 'A', dates: '2023 – 2026' },
      { title: 'Analyst', org: 'B', dates: '2024 – 2025' },
    ]),
  );
  assert.match(note, /Raise this once/);
});

test('one role cannot overlap itself', () => {
  const note = overlapNote(withRoles([{ title: 'Engineer', org: 'A', dates: 'Jan 2024 – Dec 2025' }]));
  assert.match(note, /none that need raising/);
});
