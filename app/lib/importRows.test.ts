import test from 'node:test';
import assert from 'node:assert/strict';
import { entriesFromStructure, factsFromStructure, sectionsFromStructure } from './importRows';
import { renderResumeLatex } from './latexEngine';
import { buildResume, type ContactFact, type EntryWithBullets } from './buildResume';
import type { ResumeStructure } from './types';

/**
 * What an uploaded resume must survive.
 *
 * The import used to write headings and drop everything under them, which is
 * invisible from the server: the rows insert cleanly, the stored structure
 * still looks complete, and the loss only shows when somebody opens /setup and
 * finds their jobs empty. So the real assertion here is the round trip — read a
 * resume in, build one back out of the rows, and require the same content.
 */

const SAMPLE: ResumeStructure = {
  name: 'Ada Okafor',
  contact: {
    email: 'ada@example.com',
    phone: '905-555-0142',
    linkedin: 'linkedin.com/in/ada',
    github: 'github.com/ada',
    website: 'ada.dev',
  },
  education: [
    {
      school: 'Ontario Tech University',
      location: 'Oshawa, ON',
      degree: "BEng Software Engineering · Dean's List",
      dates: 'Sep 2023 – May 2028',
      bullets: ['Relevant coursework: Data Structures, Operating Systems'],
    },
  ],
  experience: [
    {
      title: 'Backend Engineer',
      org: 'Northwind',
      location: 'Toronto, ON',
      dates: 'May 2025 – Aug 2026',
      bullets: ['Cut p95 latency from 800ms to 240ms', 'Owned the billing service'],
    },
  ],
  projects: [
    {
      name: 'FraudWatch',
      tech: 'Java, REST API',
      dates: 'Aug 2026',
      bullets: ['Built three detection algorithms over a live stream'],
      url: 'github.com/ada/fraudwatch',
    },
  ],
  skills: [
    { category: 'Languages', items: 'TypeScript, Java, SQL' },
    { category: 'Tools', items: 'Docker, Postgres' },
  ],
};


/** An imported row as the database would hand it back to buildResume. */
function rowToEntry(row: ReturnType<typeof entriesFromStructure>[number], i: number): EntryWithBullets {
  return {
    id: `entry_${i}`,
    kind: row.kind,
    title: row.title ?? '',
    org: row.org ?? '',
    location: row.location ?? '',
    city: row.city,
    region: row.region,
    country: row.country,
    startMonth: row.startMonth,
    startYear: row.startYear,
    endMonth: row.endMonth,
    endYear: row.endYear,
    isCurrent: row.isCurrent,
    datesDisplay: row.datesDisplay ?? '',
    url: row.url ?? '',
    tech: row.tech ?? '',
    extra: row.extra,
    orderIndex: row.orderIndex,
    bullets: row.bullets,
    source: 'resume_import',
  };
}

test('every bullet in the file becomes a bullet on a row', () => {
  const rows = entriesFromStructure(SAMPLE);
  const imported = rows.flatMap((r) => r.bullets);

  const expected = [
    ...SAMPLE.experience.flatMap((e) => e.bullets),
    ...SAMPLE.projects.flatMap((p) => p.bullets),
    ...SAMPLE.education.flatMap((e) => e.bullets ?? []),
  ];

  assert.deepEqual(imported.sort(), expected.sort());
  assert.ok(imported.length > 0, 'a resume with bullets must not import as headings alone');
});

test('a project keeps its stack and its link in their own columns', () => {
  const project = entriesFromStructure(SAMPLE).find((r) => r.kind === 'project');
  assert.ok(project);
  assert.equal(project.tech, 'Java, REST API');
  assert.equal(project.url, 'github.com/ada/fraudwatch');
  // The stack is not the employer. Written into org it printed in the wrong
  // place and left tech empty.
  assert.equal(project.org, null);
});

test('skills and contact details are imported as facts', () => {
  const imported = factsFromStructure(SAMPLE);
  const text = imported.map((f) => f.text);

  assert.deepEqual(
    imported.filter((f) => f.category === 'skill').map((f) => f.text),
    ['Languages: TypeScript, Java, SQL', 'Tools: Docker, Postgres'],
  );

  // Read back by prefix on /setup, so the label shape is load-bearing.
  for (const expected of [
    'Name: Ada Okafor',
    'Email: ada@example.com',
    'Phone: 905-555-0142',
    'LinkedIn: linkedin.com/in/ada',
    'GitHub: github.com/ada',
    'Website: ada.dev',
  ]) {
    assert.ok(text.includes(expected), `missing identity fact: ${expected}`);
  }
});

test('the resume rebuilt from imported rows still holds what was uploaded', () => {
  const entries: EntryWithBullets[] = entriesFromStructure(SAMPLE).map(rowToEntry);

  const factRows: ContactFact[] = factsFromStructure(SAMPLE).map((f) => ({
    category: f.category,
    text: f.text,
  }));

  const rebuilt = buildResume(entries, factRows);

  assert.equal(rebuilt.name, 'Ada Okafor');
  assert.equal(rebuilt.contact.email, 'ada@example.com');
  assert.equal(rebuilt.contact.github, 'github.com/ada');
  assert.equal(rebuilt.experience[0].bullets.length, 2);
  assert.equal(rebuilt.projects[0].tech, 'Java, REST API');
  assert.equal(rebuilt.skills.length, 2);
});

test('missing sections import as nothing rather than throwing', () => {
  const bare = { name: 'Nobody', contact: {}, education: [], experience: [], projects: [], skills: [] };
  assert.deepEqual(entriesFromStructure(bare as ResumeStructure), []);
  assert.deepEqual(factsFromStructure(bare as ResumeStructure), [{ category: 'identity', text: 'Name: Nobody' }]);
});

test('blank bullets and blank fields are not imported', () => {
  const messy: ResumeStructure = {
    ...SAMPLE,
    contact: { email: '  ', phone: 'x' },
    experience: [{ title: 'Analyst', org: 'Acme', location: '', dates: '', bullets: ['', '   ', 'Real line'] }],
    projects: [],
    education: [],
    skills: [{ category: 'Languages', items: '   ' }],
  };

  const [entry] = entriesFromStructure(messy);
  assert.deepEqual(entry.bullets, ['Real line']);
  assert.equal(entry.location, null);
  assert.equal(entry.datesDisplay, null);

  const imported = factsFromStructure(messy);
  assert.equal(imported.some((f) => f.category === 'skill'), false);
  assert.equal(imported.some((f) => f.text.startsWith('Email:')), false);
  assert.ok(imported.some((f) => f.text === 'Phone: x'));
});

// ── What the edit form can actually see ────────────────────────────────────

test('an imported job lands with dates and a place the form can show', () => {
  const job = entriesFromStructure(SAMPLE).find((r) => r.kind === 'experience');
  assert.ok(job);
  // The card and the resume already showed these; the edit form could not,
  // because it reads the columns and only the string was ever written.
  assert.equal(job.startMonth, 5);
  assert.equal(job.startYear, 2025);
  assert.equal(job.endMonth, 8);
  assert.equal(job.endYear, 2026);
  assert.equal(job.city, 'Toronto');
  assert.equal(job.region, 'ON');
  // And the originals are still there, whatever the parsing managed.
  assert.equal(job.datesDisplay, 'May 2025 – Aug 2026');
  assert.equal(job.location, 'Toronto, ON');
});

test('a degree lands split into the boxes the form has', () => {
  const school = entriesFromStructure(SAMPLE).find((r) => r.kind === 'education');
  assert.ok(school);
  assert.equal(school.title, 'Software Engineering');
  assert.equal(school.extra.credential, 'Bachelor of Engineering');
  assert.equal(school.extra.honours, "Dean's List");
});

test('clicking the credential chip cannot print it twice', () => {
  // The live corruption, pinned end to end: split on the way in, composed on
  // the way out, said once.
  const rows = entriesFromStructure(SAMPLE).filter((r) => r.kind === 'education');
  const entries: EntryWithBullets[] = rows.map((row, i) => rowToEntry(row, i));
  const rebuilt = buildResume(entries, []);
  assert.equal(rebuilt.education[0].degree, "Bachelor of Engineering in Software Engineering · Dean's List");
});

test('a date nobody can read is left exactly as written', () => {
  const messy: ResumeStructure = {
    ...SAMPLE,
    experience: [{ title: 'Intern', org: 'Acme', location: '', dates: 'Summer 2025', bullets: ['Did a thing'] }],
    projects: [],
    education: [],
  };
  const [row] = entriesFromStructure(messy);
  assert.equal(row.startYear, null, 'a season is not a month');
  assert.equal(row.datesDisplay, 'Summer 2025');

  // And the resume still prints it, because formatDates falls back.
  const rebuilt = buildResume([rowToEntry(row, 0)], []);
  assert.equal(rebuilt.experience[0].dates, 'Summer 2025');
});

test('every field an imported row carries is one the resume builder reads', () => {
  // The boundary that has now dropped columns twice.
  const [row] = entriesFromStructure(SAMPLE);
  const entry = rowToEntry(row, 0) as unknown as Record<string, unknown>;
  for (const key of Object.keys(row)) {
    if (key === 'orderIndex') continue;
    assert.ok(key in entry, `entryFromRow must carry "${key}"`);
  }
});

// ── Sections the app has no name for ───────────────────────────────────────
//
// A real upload on 2026-09-08 carried a Summary and an "Extracurricular &
// Community Activities" section with two entries. The database afterwards held
// education=1, experience=4, project=6 and nothing else: the extractor was
// told "content that does not fit the canonical set is simply omitted", and the
// summary that did survive sat in a derived blob until the next Polish
// overwrote it. These cover both halves.

const EXTRAS = [
  {
    label: 'Extracurricular & Community Activities',
    entries: [
      { title: 'Team Lead', org: 'Hack the North', location: 'Waterloo, ON', dates: 'Sep 2025', bullets: ['Led a team of four'] },
      { title: 'Volunteer', org: 'Local Food Bank', dates: '2024 – 2025', bullets: [] },
    ],
  },
  { label: 'Interests', lines: ['Chess', 'Long-distance running'] },
];

const ORDER = [
  'Summary',
  'Education',
  'Projects',
  'Work Experience',
  'Extracurricular & Community Activities',
  'Technical Skills',
  'Interests',
];

const WITH_EXTRAS: ResumeStructure = { ...SAMPLE, summary: 'Software engineer who ships.' };

test('an uploaded section the app has never heard of is kept, under its own name', () => {
  const sections = sectionsFromStructure(WITH_EXTRAS, EXTRAS, ORDER);
  const activities = sections.find((s) => s.key === 'extracurricular_community_activities');

  assert.ok(activities, 'the section survived the import');
  assert.equal(activities.label, 'Extracurricular & Community Activities', 'named as the resume named it');
  assert.equal(activities.shape, 'entries', 'shape read off the content, not self-reported');
  assert.equal(activities.entries?.length, 2);
});

test('the resume keeps its own arrangement, not the conventional one', () => {
  const sections = sectionsFromStructure(WITH_EXTRAS, EXTRAS, ORDER);
  assert.deepEqual(sections.map((s) => s.key), [
    'summary',
    'education',
    'projects',
    'experience',
    'extracurricular_community_activities',
    'skills',
    'interests',
  ]);
  assert.equal(
    sections.find((s) => s.key === 'experience')!.label,
    'Work Experience',
    'the heading the resume used, not the app default',
  );
});

test('a heading naming one of the seven does not create a second section', () => {
  const sections = sectionsFromStructure(WITH_EXTRAS, [{ label: 'Work Experience', lines: ['nope'] }], ORDER);
  assert.equal(sections.filter((s) => s.key === 'experience').length, 1);
  assert.equal(sections.find((s) => s.key === 'experience')!.shape, undefined, 'content stays in the named field');
});

test('a heading with nothing under it is dropped rather than stored empty', () => {
  // An empty section renders an itemize with no \item, which aborts the compile.
  const sections = sectionsFromStructure(WITH_EXTRAS, [{ label: 'References', lines: [] }], [...ORDER, 'References']);
  assert.ok(!sections.some((s) => s.key === 'references'));
});

test('a section missing from the order list is still kept', () => {
  const sections = sectionsFromStructure(WITH_EXTRAS, EXTRAS, ['Education']);
  const keys = sections.map((s) => s.key);
  assert.ok(keys.includes('experience'), 'the model forgetting a heading must not delete the section');
  assert.ok(keys.includes('extracurricular_community_activities'));
});

test("a custom section's entries become rows under its own key", () => {
  const sections = sectionsFromStructure(WITH_EXTRAS, EXTRAS, ORDER);
  const rows = entriesFromStructure(WITH_EXTRAS, sections);
  const mine = rows.filter((r) => r.kind === 'extracurricular_community_activities');

  assert.equal(mine.length, 2);
  assert.equal(mine[0].title, 'Team Lead');
  assert.equal(mine[0].org, 'Hack the North');
  assert.deepEqual(mine[0].bullets, ['Led a team of four']);
  assert.equal(mine[0].startYear, 2025, 'dates parse on the experience rule');
});

test('the round trip: everything uploaded comes back out of the rows', () => {
  const sections = sectionsFromStructure(WITH_EXTRAS, EXTRAS, ORDER);
  const entries = entriesFromStructure(WITH_EXTRAS, sections).map(rowToEntry);
  const facts = factsFromStructure(WITH_EXTRAS).map((f) => ({ category: f.category, text: f.text }));

  // This is the step that used to destroy things: the rebuild that runs after
  // every save, reading rows and a plan rather than the uploaded structure.
  const rebuilt = buildResume(entries, facts as ContactFact[], sections);

  assert.equal(rebuilt.summary, 'Software engineer who ships.', 'the summary survived the rebuild');
  assert.deepEqual(rebuilt.sections?.map((s) => s.key), [
    'summary',
    'education',
    'projects',
    'experience',
    'extracurricular_community_activities',
    'skills',
    'interests',
  ]);

  const activities = rebuilt.sections?.find((s) => s.key === 'extracurricular_community_activities');
  assert.equal(activities?.entries?.length, 2, 'both entries came back');
  assert.equal(activities?.entries?.[0].title, 'Team Lead');
  assert.deepEqual(activities?.entries?.[0].bullets, ['Led a team of four']);

  const interests = rebuilt.sections?.find((s) => s.key === 'interests');
  assert.deepEqual(interests?.items, ['Chess', 'Long-distance running']);
});

test('both sections print on the page, in the resume own order', () => {
  const sections = sectionsFromStructure(WITH_EXTRAS, EXTRAS, ORDER);
  const entries = entriesFromStructure(WITH_EXTRAS, sections).map(rowToEntry);
  const facts = factsFromStructure(WITH_EXTRAS).map((f) => ({ category: f.category, text: f.text }));
  const latex = renderResumeLatex(buildResume(entries, facts as ContactFact[], sections));

  const headings = [...latex.matchAll(/\\section\{([^}]*)\}/g)].map((m) => m[1]);
  assert.deepEqual(headings, [
    'Summary',
    'Education',
    'Projects',
    'Work Experience',
    'Extracurricular \\& Community Activities',
    'Technical Skills',
    'Interests',
  ]);
  assert.ok(latex.includes('\\resumeItem{Led a team of four}'));
  assert.ok(latex.includes('\\resumeItem{Long-distance running}'));
});
