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
  // Checked by content rather than by position: entries within a section are
  // sorted by date, and this test is about nothing being lost.
  const lead = activities?.entries?.find((e) => e.title === 'Team Lead');
  assert.ok(lead, 'the dated entry survived');
  assert.deepEqual(lead.bullets, ['Led a team of four']);
  assert.ok(activities?.entries?.some((e) => e.title === 'Volunteer'), 'and the other one');

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

// ── Certifications, which a resume lays out two different ways ─────────────
//
// A flat list on one resume; a name with the issuer underneath and the year on
// the right on the next. The named field is `string[]` and can only hold the
// first, and an extracted section naming one of the seven used to be dropped —
// so the resume that could not be flat was the resume that vanished.

const CERT_ENTRIES = [
  {
    label: 'Certifications',
    entries: [
      { title: 'Microsoft Certified: Azure Fundamentals (AZ-900)', org: 'Microsoft', dates: '2027' },
      { title: 'AWS Certified Cloud Practitioner', org: 'Amazon Web Services', dates: '2027' },
    ],
  },
];

test('certifications laid out with an issuer and a year keep both', () => {
  const sections = sectionsFromStructure(SAMPLE, CERT_ENTRIES, ['Education', 'Certifications']);
  const certs = sections.find((s) => s.key === 'certifications');

  assert.ok(certs, 'the section survived');
  assert.equal(certs.shape, 'entries', 'not flattened into a bullet list');
  assert.equal(certs.entries?.length, 2);
  assert.equal(certs.entries?.[0].org, 'Microsoft');
  assert.equal(certs.entries?.[0].dates, '2027');
});

test('a flat certifications list is still a flat list', () => {
  const flat: ResumeStructure = { ...SAMPLE, certifications: ['AWS Certified Cloud Practitioner'] };
  const sections = sectionsFromStructure(flat, [], ['Education', 'Certifications']);
  const certs = sections.find((s) => s.key === 'certifications');
  assert.equal(certs?.shape, 'list');
  assert.deepEqual(certs?.items, ['AWS Certified Cloud Practitioner']);
});

test('certifications answered in both places lose nothing', () => {
  // A model that fills the flat field AND returns the section must not cost
  // somebody half their certificates.
  const both: ResumeStructure = {
    ...SAMPLE,
    certifications: ['Google Data Analytics Professional Certificate, Google, 2026'],
  };
  const sections = sectionsFromStructure(both, CERT_ENTRIES, ['Education', 'Certifications']);
  const certs = sections.find((s) => s.key === 'certifications');

  assert.equal(certs?.entries?.length, 3, 'both laid-out ones plus the flat one');
  const titles = certs!.entries!.map((e) => e.title);
  assert.ok(titles.some((t) => t?.includes('Azure')));
  assert.ok(titles.some((t) => t?.includes('AWS')));
  assert.ok(titles.some((t) => t?.includes('Google')));
});

test('the same certificate written two ways is not printed twice', () => {
  const both: ResumeStructure = {
    ...SAMPLE,
    // The flat field carries the issuer and year bolted on; it is the same one.
    certifications: ['AWS Certified Cloud Practitioner, Amazon Web Services, 2027'],
  };
  const sections = sectionsFromStructure(both, CERT_ENTRIES, ['Certifications']);
  assert.equal(sections.find((s) => s.key === 'certifications')?.entries?.length, 2);
});

test("an Objective section is the summary, under the resume's own heading", () => {
  const withObjective: ResumeStructure = { ...SAMPLE, summary: 'Seeking a co-op where I can ship.' };
  const sections = sectionsFromStructure(withObjective, [], ['Objective', 'Education']);
  const summary = sections.find((s) => s.key === 'summary');
  assert.equal(summary?.label, 'Objective', 'not renamed to Summary');
  assert.equal(summary?.text, 'Seeking a co-op where I can ship.');
  assert.equal(sections[0].key, 'summary', 'and it stays at the top, where the resume had it');
});

test('an entry-shaped certifications section round trips through rows', () => {
  const sections = sectionsFromStructure(SAMPLE, CERT_ENTRIES, ['Education', 'Certifications']);
  const rows = entriesFromStructure(SAMPLE, sections);
  assert.equal(rows.filter((r) => r.kind === 'certifications').length, 2, 'stored as rows like any entry');

  const rebuilt = buildResume(rows.map(rowToEntry), [], sections);
  const certs = rebuilt.sections?.find((s) => s.key === 'certifications');
  assert.equal(certs?.entries?.length, 2, 'and come back out of them');
  assert.equal(certs?.entries?.[0].org, 'Microsoft');
  assert.ok(!rebuilt.certifications?.length, 'not also flattened into the named field, which would print twice');
});

test('a duplicate Experience section is still dropped', () => {
  // The guard that was too broad must not now be too narrow: experience lives
  // in rows, so an extra naming it is a second copy that would print twice.
  const sections = sectionsFromStructure(SAMPLE, [{ label: 'Work Experience', lines: ['nope'] }], ['Experience']);
  assert.equal(sections.filter((s) => s.key === 'experience').length, 1);
  assert.equal(sections.find((s) => s.key === 'experience')?.shape, undefined);
});

test('an Awards & Honors section is the awards section, under its own name', () => {
  const AWARDS = [{
    label: 'Awards & Honors',
    entries: [
      { title: "Dean's Honour List", org: 'Ontario Tech University', dates: '2025' },
      { title: 'Faculty of Engineering Entrance Scholarship', org: 'Ontario Tech University', dates: '2023' },
    ],
  }];
  const sections = sectionsFromStructure(SAMPLE, AWARDS, ['Education', 'Awards & Honors']);

  assert.equal(sections.filter((s) => s.key === 'awards').length, 1, 'one section, not two');
  const awards = sections.find((s) => s.key === 'awards');
  assert.equal(awards?.label, 'Awards & Honors', 'named as the resume named it');
  assert.equal(awards?.shape, 'entries', 'issuer and year kept');
  assert.equal(awards?.entries?.length, 2);
});

test('awards answered in both places print once, not twice', () => {
  // The flat field says the same award with the issuer and year bolted on.
  const both: ResumeStructure = {
    ...SAMPLE,
    awards: ["Dean's Honour List, Ontario Tech University, 2025"],
  };
  const AWARDS = [{
    label: 'Awards & Honors',
    entries: [{ title: "Dean's Honour List", org: 'Ontario Tech University', dates: '2025' }],
  }];
  const sections = sectionsFromStructure(both, AWARDS, ['Awards & Honors']);
  assert.equal(sections.filter((s) => s.key.includes('award')).length, 1);
  assert.equal(sections[0].entries?.length, 1, 'the same award is not listed twice');
});

test('a flat awards field with issuers and years becomes real entries', () => {
  // The exact three strings a real upload produced. The extractor was told to
  // send the section whole and glued each award into one string instead, which
  // put the year mid-line while every other section right-aligns its dates.
  const flat: ResumeStructure = {
    ...SAMPLE,
    awards: [
      "Dean's Honour List — Ontario Tech University, 2025",
      'Faculty of Engineering Entrance Scholarship — Ontario Tech University, 2023',
      'Hackathon Top Placement (test entry) — Sample Hackathon Organizer, 2026',
    ],
  };
  const sections = sectionsFromStructure(flat, [], ['Education', 'Awards & Honors']);
  const awards = sections.find((s) => s.key === 'awards');

  assert.equal(awards?.shape, 'entries');
  assert.equal(awards?.label, 'Awards & Honors');
  assert.deepEqual(
    awards?.entries?.map((e) => [e.title, e.org, e.dates]),
    [
      ["Dean's Honour List", 'Ontario Tech University', '2025'],
      ['Faculty of Engineering Entrance Scholarship', 'Ontario Tech University', '2023'],
      ['Hackathon Top Placement (test entry)', 'Sample Hackathon Organizer', '2026'],
    ],
  );
});

test('awards written as sentences stay a plain list', () => {
  // Indeed's own example style. Three fields would be an invention.
  const prose: ResumeStructure = {
    ...SAMPLE,
    awards: [
      'Named in the "Top 50 Health Blogs and Websites of 2022" by Health and Wellness Magazine',
      'Awarded Website of the Year by Web Professionals for exceptional user experience design',
    ],
  };
  const awards = sectionsFromStructure(prose, [], ['Awards']).find((s) => s.key === 'awards');
  assert.equal(awards?.shape, 'list');
  assert.equal(awards?.items?.length, 2);
});

test('two sections of a person own kind live side by side', () => {
  // A resume with both Volunteer Experience and Extracurricular Activities.
  // Their entries must be filed apart, or one section prints the other's rows.
  const EXTRAS = [
    { label: 'Volunteer Experience', entries: [
      { title: 'Community Website Developer', org: 'African Family Connect', location: 'Oshawa, ON', dates: 'Nov 2025 – Dec 2025', bullets: ['Built a community website'] },
      { title: 'Peer Mentor', org: 'Ontario Tech University', location: 'Oshawa, ON', dates: '2025 – Present', bullets: ['Mentored'] },
    ]},
    { label: 'Extracurricular & Community Activities', entries: [
      { title: 'Content Creator', org: 'Kudi Kitchen', location: 'Oshawa, ON', dates: 'Mar 2025 – Present', bullets: ['Published content'] },
    ]},
  ];
  const order = ['Education', 'Experience', 'Volunteer Experience', 'Extracurricular & Community Activities'];
  const sections = sectionsFromStructure(SAMPLE, EXTRAS, order);

  assert.deepEqual(sections.map((s) => s.key), [
    'education',
    'experience',
    'volunteer_experience',
    'extracurricular_community_activities',
    'projects',
    'skills',
  ]);

  const rows = entriesFromStructure(SAMPLE, sections);
  assert.equal(rows.filter((r) => r.kind === 'volunteer_experience').length, 2);
  assert.equal(rows.filter((r) => r.kind === 'extracurricular_community_activities').length, 1);
  assert.equal(rows.filter((r) => r.kind === 'experience').length, 1, "the person's actual job, untouched");
});

test('volunteering never lands in the job history', () => {
  // The failure this guards is silent: merged into experience, the heading is
  // gone and unpaid work reads as employment.
  const EXTRAS = [{ label: 'Volunteer Experience', entries: [{ title: 'Coach', org: 'Local Club', bullets: ['Coached'] }] }];
  const sections = sectionsFromStructure(SAMPLE, EXTRAS, ['Experience', 'Volunteer Experience']);
  const experience = sections.find((s) => s.key === 'experience');

  assert.equal(experience?.shape, undefined, 'still just order and label');
  assert.ok(sections.some((s) => s.key === 'volunteer_experience'));
  assert.equal(
    entriesFromStructure(SAMPLE, sections).filter((r) => r.kind === 'experience').length,
    1,
    'one real job, not two',
  );
});
