import test from 'node:test';
import assert from 'node:assert/strict';
import { entriesFromStructure, factsFromStructure } from './importRows';
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
