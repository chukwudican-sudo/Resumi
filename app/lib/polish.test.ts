import assert from 'node:assert';
import test from 'node:test';
import { applyPolish, otherSections, overlapNote, validateCorrections, validatePolish, type PolishResult } from './polish';
import { contentFor, contentOf, hasContent, planSections, shapeOf } from './sections';
import { buildResume } from './buildResume';
import type { ResumeSection, ResumeStructure } from './types';

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
  assert.equal(result.skillGroups.length, 1);
  assert.equal(result.skillGroups[0].category, 'Languages');
  // Python and TypeScript are what the pass returned. Java and SQL are listed
  // plainly under "Core languages" and it forgot them, so they are put back —
  // see the recovery test below.
  assert.deepEqual(result.skillGroups[0].items, ['Python', 'TypeScript', 'Java', 'SQL']);
});

test('a term the pass forgot is put back rather than lost', () => {
  // The bug this exists for: a real resume listed "Ms PowerPoint" and the
  // document came back without it. Nobody notices a skill that quietly is not
  // there.
  const source = 'Skills: Java, SQL, Microsoft Excel, Ms PowerPoint, Team Leadership';
  const result = validatePolish(
    polish({
      skillGroups: [
        { category: 'Languages', items: ['Java', 'SQL'] },
        { category: 'Tools', items: ['Microsoft Excel'] },
      ],
    }),
    source,
  );

  const kept = result.skillGroups.flatMap((g) => g.items);
  assert.ok(kept.includes('Ms PowerPoint'), 'a listed skill must not disappear');
  assert.ok(kept.includes('Team Leadership'));
});

test('prose in the skills box is not echoed back as a skill', () => {
  // Half the reason this pass exists is that people write sentences here.
  // Recovering what the model left behind must not undo the extraction.
  const result = validatePolish(polish(), SOURCE_SKILLS);
  const kept = result.skillGroups.flatMap((g) => g.items);
  for (const phrase of kept) {
    assert.ok(phrase.split(/\s+/).length <= 3, `"${phrase}" is a sentence, not a skill`);
  }
  assert.equal(kept.some((k) => k.toLowerCase().startsWith('uses ')), false);
  assert.equal(kept.some((k) => k.toLowerCase().includes('coursework')), false);
});

test('a skill nobody claimed is dropped', () => {
  // The whole reason grouping is safe: it can only rearrange what was given.
  const result = validatePolish(
    polish({ skillGroups: [{ category: 'Languages', items: ['Python', 'Rust', 'Kubernetes'] }] }),
    SOURCE_SKILLS,
  );
  const kept = result.skillGroups.flatMap((g) => g.items);
  assert.equal(kept.includes('Rust'), false, 'Rust appears nowhere in the source');
  assert.equal(kept.includes('Kubernetes'), false, 'Kubernetes appears nowhere in the source');
  assert.ok(kept.includes('Python'));
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
  const python = result.skillGroups.flatMap((g) => g.items).filter((i) => i === 'Python');
  assert.equal(python.length, 1, 'the same skill in two groups reads as padding');
});

test('matching ignores punctuation and case, so C++ survives', () => {
  const result = validatePolish(
    polish({ skillGroups: [{ category: 'Languages', items: ['C++', 'sql'] }] }),
    SOURCE_SKILLS,
  );
  const kept = result.skillGroups[0].items;
  assert.ok(kept.includes('C++'), 'punctuation must not sink a real skill');
  assert.ok(kept.includes('sql'), 'case must not sink a real skill');
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

test('an apostrophe is not a spelling error', () => {
  // "Dean Listst" -> "Dean's List" is one missing letter and a misplaced
  // apostrophe. Counted character by character it scores four edits, because
  // the apostrophe shifts everything after it — and the guard threw away a
  // correction the model got right three times out of three.
  const kept = (from: string, to: string) =>
    validateCorrections([{ from, to, reason: 'x' }]).length === 1;

  assert.ok(kept('Dean Listst', "Dean's List"));
  assert.ok(kept('OBrien', "O'Brien"));
  assert.ok(kept('Masters degree', "Master's degree"));
});

test('rewrites are still refused when punctuation is ignored', () => {
  const kept = (from: string, to: string) =>
    validateCorrections([{ from, to, reason: 'x' }]).length === 1;

  assert.ok(!kept('Operations Specialist', 'Senior Operations Manager'));
  assert.ok(!kept('Contributed to the work', 'Led the work'));
  assert.ok(!kept('Aegon', 'Aegon Financial Services'), 'an expansion is not a spelling fix');
  assert.ok(!kept('Managed team', 'Directed team'), 'a different verb is an edit');
  assert.ok(!kept('ap', 'app'), 'too short to replace safely');
});

// ── The trap ───────────────────────────────────────────────────────────────
//
// polishIfStale runs before every tailor. While the whitelist here was a
// hardcoded four, a section imported from somebody's own resume survived the
// upload, sat in the database, and was deleted the first time they tailored —
// the feature appearing to work right up until it mattered.

const OWN_SECTIONS = [
  { key: 'summary', label: 'Summary' },
  { key: 'education', label: 'Education' },
  { key: 'experience', label: 'Work Experience' },
  { key: 'extracurricular', label: 'Extracurricular & Community Activities' },
  { key: 'skills', label: 'Technical Skills' },
];

test('a section the person actually has survives the pass', () => {
  const result = validatePolish(
    polish({
      sections: [
        { key: 'education', label: 'Education' },
        { key: 'summary', label: 'Summary' },
        { key: 'extracurricular', label: 'Extracurricular & Community Activities' },
      ],
    }),
    SOURCE_SKILLS,
    OWN_SECTIONS,
  );
  assert.equal(result.sections.length, OWN_SECTIONS.length, 'nothing was deleted for being unfamiliar');
  assert.ok(result.sections.some((s) => s.key === 'extracurricular'));
  assert.ok(result.sections.some((s) => s.key === 'summary'));
});

test('the pass may reorder a custom section but not drop it', () => {
  const result = validatePolish(
    polish({ sections: [{ key: 'skills', label: 'Technical Skills' }] }),
    SOURCE_SKILLS,
    OWN_SECTIONS,
  );
  assert.equal(result.sections[0].key, 'skills', 'what it did say is honoured');
  assert.ok(result.sections.some((s) => s.key === 'extracurricular'), 'the rest is restored, not lost');
});

test('a section this person does not have cannot be invented', () => {
  const result = validatePolish(
    polish({ sections: [{ key: 'publications', label: 'Publications' }] }),
    SOURCE_SKILLS,
    OWN_SECTIONS,
  );
  assert.ok(!result.sections.some((s) => s.key === 'publications'));
  assert.equal(result.sections.length, OWN_SECTIONS.length);
});

test('applying the pass keeps a custom section drawable', () => {
  // The pass returns a key and a label. Assigning that wholesale would strip
  // the shape that says how to draw the section and the content that IS the
  // section — deleting it by way of the thing asked only to order it.
  const structure = {
    name: 'Ada',
    contact: {},
    education: [],
    experience: [],
    projects: [],
    skills: [],
    sections: [
      { key: 'summary', label: 'Summary', shape: 'prose' as const, text: 'Ships software.' },
      {
        key: 'extracurricular',
        label: 'Extracurricular & Community Activities',
        shape: 'entries' as const,
        entries: [{ title: 'Team Lead', org: 'Hack the North', bullets: ['Led four'] }],
      },
    ],
  } satisfies ResumeStructure;

  const applied = applyPolish(structure, polish({
    sections: [
      { key: 'summary', label: 'Summary' },
      { key: 'extracurricular', label: 'Activities' },
    ],
  }));

  const activities = applied.sections?.find((s) => s.key === 'extracurricular');
  assert.equal(activities?.label, 'Activities', 'the rename is applied');
  assert.equal(activities?.shape, 'entries', 'the shape survived');
  assert.equal(activities?.entries?.length, 1, 'the content survived');
  assert.equal(applied.sections?.find((s) => s.key === 'summary')?.text, 'Ships software.');
});

test('a profile that predates sections does not lose its summary to the pass', () => {
  // The case that would have hit every account that uploaded before this
  // existed: a summary in the derived blob, and a plan naming only the four
  // sections the app used to know. Taking that plan literally left the summary
  // out of what the pass was allowed to return, so the validator dropped it and
  // the polish that runs before every tailor deleted the paragraph.
  const legacy = {
    name: 'Ada',
    contact: { email: 'a@b.com' },
    summary: 'Software engineer who ships.',
    education: [],
    experience: [{ title: 'Engineer', dates: '2025', org: 'Acme', location: 'Remote', bullets: ['Shipped'] }],
    projects: [],
    skills: [{ category: 'Languages', items: 'TypeScript' }],
    sections: [
      { key: 'education', label: 'Education' },
      { key: 'experience', label: 'Experience' },
      { key: 'projects', label: 'Projects' },
      { key: 'skills', label: 'Technical Skills' },
    ],
  } satisfies ResumeStructure;

  const present = planSections(legacy)
    .filter((s) => hasContent(contentFor(legacy, s)))
    .map((s) => ({ key: s.key, label: s.label }));

  assert.ok(present.some((s) => s.key === 'summary'), 'the summary is one of this page sections');
  assert.ok(!present.some((s) => s.key === 'projects'), 'an empty section is not');

  const result = validatePolish(
    polish({ sections: [{ key: 'experience', label: 'Experience' }] }),
    SOURCE_SKILLS,
    present,
  );
  assert.ok(result.sections.some((s) => s.key === 'summary'), 'and it survives the pass');
});

test('polishing repeatedly does not empty the summary row', () => {
  // Found by checking whether the wrong shape values would self-heal, not by
  // reading the code: buildResume stripped content off the plan for all seven
  // known keys. Right for the four whose content is rows and facts, wrong for
  // the three that live on the section row itself — so the pass read an empty
  // summary back and saved that emptiness, deleting the paragraph. The same
  // failure this whole feature exists to fix, arriving through another door.
  let plan: ResumeSection[] = [
    { key: 'summary', label: 'Summary', shape: 'prose', text: 'Software engineer who ships.' },
    { key: 'education', label: 'Education' },
    { key: 'projects', label: 'Technical Projects' },
    { key: 'skills', label: 'Technical Skills' },
  ];

  for (let pass = 0; pass < 3; pass += 1) {
    const built = buildResume([], [{ category: 'identity', text: 'Name: Ada' }], plan);
    const applied = applyPolish(
      built,
      polish({ skillGroups: [], sections: plan.map((s) => ({ key: s.key, label: s.label })) }),
    );
    plan = applied.sections ?? [];

    const summary = plan.find((s) => s.key === 'summary')!;
    assert.deepEqual(
      contentOf(summary),
      { text: 'Software engineer who ships.' },
      `summary survived polish ${pass + 1}`,
    );
    // And the shapes written to the row are the real ones, which also means a
    // profile carrying the old wrong values corrects itself on the next pass.
    assert.equal(shapeOf(plan.find((s) => s.key === 'projects')!), 'inline');
    assert.equal(shapeOf(plan.find((s) => s.key === 'skills')!), 'groups');
  }
});

test('the pass is shown every section it is asked to order', () => {
  // It used to be handed skills, education, experience and projects, then a
  // bare list of section keys — so it decided where "Awards & Honors" belonged
  // on the page without having seen a single award, and could not raise one
  // missing an issuer while being asked for warnings about the resume.
  const structure = {
    name: 'Ada',
    contact: { email: 'a@b.com' },
    summary: 'Ships software.',
    education: [],
    experience: [],
    projects: [],
    skills: [],
    sections: [
      { key: 'summary', label: 'Objective', shape: 'prose' as const, text: 'Ships software.' },
      {
        key: 'awards',
        label: 'Awards & Honors',
        shape: 'entries' as const,
        entries: [{ title: "Dean's Honour List", org: 'Ontario Tech University', dates: '2025' }],
      },
      {
        key: 'languages',
        label: 'Languages',
        shape: 'groups' as const,
        groups: [{ category: 'English', items: 'Native' }],
      },
      { key: 'interests', label: 'Interests', shape: 'list' as const, items: ['Chess'] },
    ],
  } satisfies ResumeStructure;

  const seen = otherSections(structure);
  assert.ok(seen.includes('Awards & Honors'), 'named as the person named it');
  assert.ok(seen.includes("Dean's Honour List"), 'and its content');
  assert.ok(seen.includes('Ontario Tech University'), 'including the issuer it might be missing');
  assert.ok(seen.includes('2025'));
  assert.ok(seen.includes('English: Native'));
  assert.ok(seen.includes('Chess'));
  assert.ok(seen.includes('Ships software.'));
});

test('the four spelled out elsewhere are not sent twice', () => {
  const structure = {
    name: 'Ada',
    contact: { email: 'a@b.com' },
    education: [{ school: 'MIT', location: 'MA', degree: 'BS', dates: '2022' }],
    experience: [{ title: 'Engineer', org: 'Acme', location: 'Remote', dates: '2025', bullets: ['Shipped'] }],
    projects: [],
    skills: [{ category: 'Tools', items: 'Git' }],
  } satisfies ResumeStructure;

  const seen = otherSections(structure);
  assert.ok(!seen.includes('MIT'), 'education has its own block');
  assert.ok(!seen.includes('Acme'), 'so does experience');
  assert.ok(!seen.includes('Git'), 'and skills');
  assert.equal(seen, '(none)');
});
