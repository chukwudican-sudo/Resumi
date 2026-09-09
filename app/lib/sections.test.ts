import assert from 'node:assert';
import test from 'node:test';
import {
  ADDABLE,
  CONVENTIONAL_ORDER,
  isRemovable,
  ownSections,
  withSectionAdded,
  withSectionRemoved,
  withSectionRenamed,
  contentFor,
  contentOf,
  hasContent,
  inferShape,
  keyFor,
  planSections,
  sectionFromRow,
  shapeOf,
} from './sections';
import { sectionStatus } from './buildResume';
import { renderResumeLatex } from './latexEngine';
import { formatDates } from './entryFormat';
import type { ResumeSection, ResumeStructure } from './types';

const base: ResumeStructure = {
  name: 'Jane Doe',
  contact: { email: 'jane@example.com' },
  education: [{ school: 'MIT', location: 'Cambridge, MA', degree: 'BS', dates: '2018 - 2022' }],
  experience: [{ title: 'Engineer', dates: '2022 - Present', org: 'Acme', location: 'Remote', bullets: ['Shipped'] }],
  projects: [{ name: 'Proj', tech: 'Rust', dates: '2023', bullets: ['Built'] }],
  skills: [{ category: 'Languages', items: 'Rust, Go' }],
};

const keys = (structure: ResumeStructure) => planSections(structure).map((s) => s.key);

// ── The regression lock ────────────────────────────────────────────────────
// This is the whole point of writing the module before touching the renderer:
// if these two drift, every existing resume re-orders itself.

test('a structure with no plan renders in the order the engine hardcoded', () => {
  assert.deepStrictEqual(keys({ ...base, sections: undefined }), [
    'summary',
    'education',
    'experience',
    'projects',
    'skills',
    'certifications',
    'awards',
  ]);
});

test('the conventional order names its labels as the engine did', () => {
  const labels = CONVENTIONAL_ORDER.map((s) => s.label);
  assert.deepStrictEqual(labels, [
    'Summary',
    'Education',
    'Experience',
    'Projects',
    'Technical Skills',
    'Certifications',
    'Awards',
  ]);
});

test('a plan from polish keeps summary above it and the extras below', () => {
  // Exactly what validatePolish has always returned: four sections, no mention
  // of the summary, and the renderer put it on top anyway.
  const plan = planSections({
    ...base,
    sections: [
      { key: 'education', label: 'Education' },
      { key: 'experience', label: 'Experience' },
      { key: 'projects', label: 'Projects' },
      { key: 'skills', label: 'Technical Skills' },
    ],
  });
  assert.deepStrictEqual(plan.map((s) => s.key), [
    'summary',
    'education',
    'experience',
    'projects',
    'skills',
    'certifications',
    'awards',
  ]);
});

test('projects above experience is honoured, not re-sorted', () => {
  const plan = keys({
    ...base,
    sections: [
      { key: 'education', label: 'Education' },
      { key: 'projects', label: 'Technical Projects' },
      { key: 'experience', label: 'Work Experience' },
      { key: 'skills', label: 'Skills' },
    ],
  });
  assert.deepStrictEqual(plan.slice(0, 5), ['summary', 'education', 'projects', 'experience', 'skills']);
});

test('a label from the plan wins over the conventional one', () => {
  const plan = planSections({ ...base, sections: [{ key: 'experience', label: 'Work Experience' }] });
  assert.strictEqual(plan.find((s) => s.key === 'experience')!.label, 'Work Experience');
});

// ── Custom sections ────────────────────────────────────────────────────────

test('a custom section stays where it was placed', () => {
  const plan = keys({
    ...base,
    sections: [
      { key: 'education', label: 'Education' },
      { key: 'projects', label: 'Projects' },
      { key: 'experience', label: 'Experience' },
      { key: 'extracurricular', label: 'Extracurricular & Community Activities', shape: 'entries' },
      { key: 'skills', label: 'Skills' },
    ],
  });
  assert.deepStrictEqual(plan, [
    'summary',
    'education',
    'projects',
    'experience',
    'extracurricular',
    'skills',
    'certifications',
    'awards',
  ]);
});

test('a custom section before everything conventional still comes first', () => {
  const plan = keys({
    ...base,
    sections: [
      { key: 'volunteering', label: 'Volunteering', shape: 'entries' },
      { key: 'experience', label: 'Experience' },
    ],
  });
  assert.strictEqual(plan[0], 'volunteering');
});

test('a known key cannot be redrawn as something else', () => {
  const plan = planSections({
    ...base,
    sections: [{ key: 'experience', label: 'Experience', shape: 'prose', text: 'nice try' }],
  });
  assert.strictEqual(plan.find((s) => s.key === 'experience')!.shape, 'entries');
});

test('a section named twice prints once', () => {
  const plan = keys({
    ...base,
    sections: [
      { key: 'experience', label: 'Experience' },
      { key: 'experience', label: 'Experience Again' },
    ],
  });
  assert.strictEqual(plan.filter((k) => k === 'experience').length, 1);
});

test('a custom section with no shape and no content is dropped', () => {
  const plan = keys({ ...base, sections: [{ key: 'mystery', label: 'Mystery' }] });
  assert.ok(!plan.includes('mystery'));
});

test('the three extras are optional and the four core ones are not', () => {
  const plan = planSections({ ...base, sections: undefined });
  const optional = plan.filter((s) => s.optional).map((s) => s.key);
  assert.deepStrictEqual(optional, ['summary', 'certifications', 'awards']);
});

// ── Shape, read off the content ────────────────────────────────────────────

test('rows with an organisation under the title are entries', () => {
  assert.strictEqual(
    inferShape({ entries: [{ title: 'Volunteer', org: 'Food Bank' }] }),
    'entries',
  );
});

test('rows with a title and dates are inline, like projects', () => {
  assert.strictEqual(
    inferShape({ entries: [{ title: 'A Paper', dates: '2025', bullets: ['On something'] }] }),
    'inline',
  );
});

test('bare titles with nothing under them are a list', () => {
  // They used to be drawn as project headings, which gave each one an empty
  // date column on the right of the page.
  assert.strictEqual(inferShape({ entries: [{ title: 'A Paper' }, { title: 'Another' }] }), 'list');
});

test('lines that all read Label: items are groups', () => {
  assert.strictEqual(
    inferShape({ lines: ['Languages: Rust, Go', 'Tools: Docker, Git'] }),
    'groups',
  );
});

test('a lone labelled line without a list is not a group', () => {
  assert.strictEqual(inferShape({ lines: ["Dean's List: Fall 2024"] }), 'list');
});

test('plain lines are a list', () => {
  assert.strictEqual(
    inferShape({ lines: ['AWS Certified Solutions Architect', 'CFA Level I'] }),
    'list',
  );
});

test('a paragraph is prose', () => {
  assert.strictEqual(inferShape({ text: 'Software engineer with five years of work.' }), 'prose');
});

test('nothing at all has no shape', () => {
  assert.strictEqual(inferShape({ entries: [], lines: [], text: '   ' }), null);
});

// ── Content ────────────────────────────────────────────────────────────────

test('education fills the slots the template has always given it', () => {
  const plan = planSections(base);
  const content = contentFor(base, plan.find((s) => s.key === 'education')!);
  assert.strictEqual(content.shape, 'entries');
  assert.deepStrictEqual(content.shape === 'entries' ? content.entries[0] : null, {
    heading: 'MIT',
    headingRight: 'Cambridge, MA',
    sub: 'BS',
    subRight: '2018 - 2022',
    url: '',
    bullets: [],
  });
});

test('experience fills them the other way round, as it always has', () => {
  const plan = planSections(base);
  const content = contentFor(base, plan.find((s) => s.key === 'experience')!);
  assert.deepStrictEqual(content.shape === 'entries' ? content.entries[0] : null, {
    heading: 'Engineer',
    headingRight: '2022 - Present',
    sub: 'Acme',
    subRight: 'Remote',
    url: '',
    bullets: ['Shipped'],
  });
});

test('a custom entries section reads like experience, not like education', () => {
  const structure: ResumeStructure = {
    ...base,
    sections: [
      {
        key: 'extracurricular',
        label: 'Extracurricular',
        shape: 'entries',
        entries: [{ title: 'President', org: 'Robotics Club', location: 'Oshawa, ON', dates: '2024', bullets: ['Ran it'] }],
      },
    ],
  };
  const plan = planSections(structure);
  const content = contentFor(structure, plan.find((s) => s.key === 'extracurricular')!);
  assert.deepStrictEqual(content.shape === 'entries' ? content.entries[0] : null, {
    heading: 'President',
    headingRight: '2024',
    sub: 'Robotics Club',
    subRight: 'Oshawa, ON',
    url: '',
    bullets: ['Ran it'],
  });
});

test('an empty section has no content, however it is shaped', () => {
  const empty: ResumeStructure = {
    ...base,
    summary: '   ',
    education: [],
    experience: [],
    projects: [],
    skills: [{ category: 'Languages', items: '  ' }],
  };
  for (const section of planSections(empty)) {
    assert.ok(!hasContent(contentFor(empty, section)), `${section.key} should be empty`);
  }
});

// ── Keys ───────────────────────────────────────────────────────────────────

test('a resume saying Work Experience does not get a second experience section', () => {
  assert.strictEqual(keyFor('Work Experience'), 'experience');
  assert.strictEqual(keyFor('Professional Summary'), 'summary');
  assert.strictEqual(keyFor('Honours'), 'awards');
  assert.strictEqual(keyFor('Technical Skills'), 'skills');
});

test('an unfamiliar section is slugged from what it was called', () => {
  assert.strictEqual(keyFor('Extracurricular & Community Activities'), 'extracurricular_community_activities');
  assert.strictEqual(keyFor('Publications'), 'publications');
});

test('two sections that slug the same do not share a key', () => {
  assert.strictEqual(keyFor('Volunteering!', ['volunteering']), 'volunteering_2');
});

test('a key never ends up empty or unbounded', () => {
  assert.strictEqual(keyFor('***'), 'section');
  assert.ok(keyFor('A'.repeat(200)).length <= 48);
  assert.ok(!keyFor('A'.repeat(200)).endsWith('_'));
});

// ── The rail ───────────────────────────────────────────────────────────────

test('an extra nobody has stays off the rail', () => {
  const rail = sectionStatus(base).map((s) => s.key);
  assert.deepStrictEqual(rail, ['contact', 'education', 'experience', 'projects', 'skills']);
});

test('the rail lists sections in the order the page prints them', () => {
  const structure: ResumeStructure = {
    ...base,
    summary: 'Ships software.',
    sections: [
      { key: 'summary', label: 'Summary', shape: 'prose', text: 'Ships software.' },
      { key: 'education', label: 'Education' },
      { key: 'projects', label: 'Projects' },
      { key: 'experience', label: 'Work Experience' },
      { key: 'skills', label: 'Technical Skills' },
    ],
  };
  const rail = sectionStatus(structure);
  assert.deepStrictEqual(rail.map((s) => s.key), [
    'contact',
    'summary',
    'education',
    'projects',
    'experience',
    'skills',
  ]);
  assert.strictEqual(rail.find((s) => s.key === 'experience')!.label, 'Work Experience');
  assert.strictEqual(rail.find((s) => s.key === 'summary')!.detail, '1 paragraph');
});

test('a summary cleared to rewrite it does not vanish from the rail', () => {
  const structure: ResumeStructure = {
    ...base,
    summary: undefined,
    sections: [{ key: 'summary', label: 'Summary', shape: 'prose', text: '' }],
  };
  const summary = sectionStatus(structure).find((s) => s.key === 'summary');
  assert.ok(summary, 'still offered');
  assert.strictEqual(summary.done, false);
  assert.strictEqual(summary.detail, 'None yet');
});

test('a custom section reaches the rail with the right editor', () => {
  const structure: ResumeStructure = {
    ...base,
    sections: [
      { key: 'experience', label: 'Experience' },
      {
        key: 'extracurricular',
        label: 'Extracurricular & Community Activities',
        shape: 'entries',
        entries: [{ title: 'Team Lead', org: 'Hack the North' }, { title: 'Volunteer', org: 'Food Bank' }],
      },
    ],
  };
  const row = sectionStatus(structure).find((s) => s.key === 'extracurricular');
  assert.strictEqual(row!.label, 'Extracurricular & Community Activities');
  assert.strictEqual(row!.shape, 'entries', 'opens the same editor as Experience');
  assert.strictEqual(row!.detail, '2 added');
});

// ── What gets written to the row ───────────────────────────────────────────

test('a known section is stored as the shape it really is', () => {
  // Defaulting to 'entries' wrote "this is a list of jobs" next to Projects and
  // Skills. Invisible, because the renderer looks a known shape up again rather
  // than trusting the column — and wrong for anything that does trust it.
  assert.strictEqual(shapeOf({ key: 'projects', label: 'Projects' }), 'inline');
  assert.strictEqual(shapeOf({ key: 'skills', label: 'Technical Skills' }), 'groups');
  assert.strictEqual(shapeOf({ key: 'summary', label: 'Summary' }), 'prose');
  assert.strictEqual(shapeOf({ key: 'experience', label: 'Experience' }), 'entries');
  assert.strictEqual(shapeOf({ key: 'volunteering', label: 'Volunteering', shape: 'list' }), 'list');
});

test('sections whose content lives in rows and facts store none of it', () => {
  // `{"groups": []}` beside a profile full of skills reads as a claim that
  // there are none.
  for (const key of ['education', 'experience', 'projects', 'skills']) {
    assert.deepStrictEqual(contentOf({ key, label: key }), {}, `${key} should store no content`);
  }
});

test('the three with nowhere else to live store their content', () => {
  assert.deepStrictEqual(contentOf({ key: 'summary', label: 'Summary', text: 'Ships.' }), { text: 'Ships.' });
  assert.deepStrictEqual(
    contentOf({ key: 'certifications', label: 'Certifications', items: ['AWS'] }),
    { items: ['AWS'] },
  );
  assert.deepStrictEqual(
    contentOf({ key: 'interests', label: 'Interests', shape: 'list', items: ['Chess'] }),
    { items: ['Chess'] },
  );
});

test('a row survives the round trip to the database and back', () => {
  const section = { key: 'interests', label: 'Interests', shape: 'list' as const, items: ['Chess', 'Running'] };
  const back = sectionFromRow({
    key: section.key,
    label: section.label,
    shape: shapeOf(section),
    content: contentOf(section),
    orderIndex: 0,
  });
  assert.deepStrictEqual(back, section);
});

test('a section cannot claim the rail slot Contact sits in', () => {
  // Two rail items under one key: React warns, and the section is permanently
  // unreachable because the pinned Contact matches first.
  assert.notStrictEqual(keyFor('Contact'), 'contact');
  assert.notStrictEqual(keyFor('CONTACT'), 'contact');
});

// ── Labels, not things you did ─────────────────────────────────────────────

const LANGUAGES = [
  { title: 'English', bullets: ['Native / Fluent'] },
  { title: 'Igbo', bullets: ['Conversational'] },
  { title: 'French', bullets: ['Basic'] },
];

test('a Languages section is label and value, not a list of jobs', () => {
  // It extracts as rows with a title and one short line — structurally the
  // same as a project with one bullet. Read as a project it printed "English"
  // with a date column beside it, which is not a thing a language has.
  assert.strictEqual(inferShape({ entries: LANGUAGES }), 'groups');
});

test('names with nothing under them are a plain list', () => {
  assert.strictEqual(
    inferShape({ entries: [{ title: 'English' }, { title: 'Igbo' }, { title: 'French' }] }),
    'list',
  );
});

test('a project with one bullet is still a project', () => {
  // The guard rails: a date, a stack, a link, or a second line all say this is
  // something somebody did rather than a label.
  assert.strictEqual(
    inferShape({ entries: [{ title: 'Portfolio', dates: '2025', bullets: ['Built it'] }, { title: 'Other', bullets: ['x'] }] }),
    'inline',
  );
  assert.strictEqual(
    inferShape({ entries: [{ title: 'Portfolio', tech: 'Next.js', bullets: ['Built it'] }, { title: 'Other', bullets: ['x'] }] }),
    'inline',
  );
  assert.strictEqual(
    inferShape({ entries: [{ title: 'Portfolio', bullets: ['Built it', 'Shipped it'] }, { title: 'Other', bullets: ['x'] }] }),
    'inline',
  );
});

test('a sentence about work is not a value', () => {
  assert.strictEqual(
    inferShape({
      entries: [
        { title: 'Resumi', bullets: ['Built a full-stack AI-powered web application with a React frontend and four endpoints'] },
        { title: 'MealApp', bullets: ['Built a cross-platform mobile app targeting Android and iOS from one codebase'] },
      ],
    }),
    'inline',
  );
});

test('one pair on its own is not a pattern', () => {
  assert.strictEqual(inferShape({ entries: [{ title: 'English', bullets: ['Native'] }] }), 'inline');
});

test('two label-and-value sections do not share their content', () => {
  // Once Languages started arriving as label-and-value it opened the same
  // editor as Skills — which was hardwired to skills, so the rail had two rows
  // showing and saving one thing.
  const structure: ResumeStructure = {
    ...base,
    skills: [{ category: 'Languages & Frameworks', items: 'TypeScript, React' }],
    sections: [
      { key: 'skills', label: 'Technical Skills' },
      {
        key: 'languages',
        label: 'Languages',
        shape: 'groups',
        groups: [
          { category: 'English', items: 'Native' },
          { category: 'Igbo', items: 'Conversational' },
        ],
      },
    ],
  };
  const plan = planSections(structure);

  const skills = contentFor(structure, plan.find((s) => s.key === 'skills')!);
  const languages = contentFor(structure, plan.find((s) => s.key === 'languages')!);

  assert.deepStrictEqual(skills.shape === 'groups' ? skills.groups : null, [
    { category: 'Languages & Frameworks', items: 'TypeScript, React' },
  ]);
  assert.deepStrictEqual(languages.shape === 'groups' ? languages.groups : null, [
    { category: 'English', items: 'Native' },
    { category: 'Igbo', items: 'Conversational' },
  ]);
});

test('a language listed with no level is kept, not dropped', () => {
  // The three-box editor makes this reachable: pick a language, leave the
  // level alone. Requiring both boxes would delete the row on save.
  const structure: ResumeStructure = {
    ...base,
    sections: [
      {
        key: 'languages',
        label: 'Languages',
        shape: 'groups',
        groups: [
          { category: 'English', items: 'Native' },
          { category: 'Yoruba', items: '' },
          { category: '', items: '' },
        ],
      },
    ],
  };
  const plan = planSections(structure);
  const content = contentFor(structure, plan.find((s) => s.key === 'languages')!);
  assert.deepStrictEqual(content.shape === 'groups' ? content.groups : null, [
    { category: 'English', items: 'Native' },
    { category: 'Yoruba', items: '' },
  ], 'the empty row goes, the label-only row stays');
});

test('a label with no value prints without a dangling colon', () => {
  const structure: ResumeStructure = {
    ...base,
    sections: [
      { key: 'experience', label: 'Experience' },
      {
        key: 'languages',
        label: 'Languages',
        shape: 'groups',
        groups: [{ category: 'English', items: 'Native' }, { category: 'Yoruba', items: '' }],
      },
    ],
  };
  const latex = renderResumeLatex(structure);
  assert.ok(latex.includes('\\textbf{English}{: Native}'));
  assert.ok(latex.includes('\\textbf{Yoruba} \\\\'), 'no colon after a label with nothing beside it');
  assert.ok(!latex.includes('\\textbf{Yoruba}{: }'));
});

test('an entry-shaped section prints the link it was given', () => {
  // Every entry editor has had a link box and only projects ever printed one,
  // so a certificate's Verify link went into the database and never onto the
  // page. Every guide on certifications recommends carrying it.
  const structure: ResumeStructure = {
    ...base,
    sections: [
      { key: 'experience', label: 'Experience' },
      {
        key: 'certifications',
        label: 'Certifications',
        shape: 'entries',
        entries: [
          { title: 'AWS Certified Cloud Practitioner', org: 'Amazon Web Services', dates: 'Jun 2025 – Jun 2028', url: 'credly.com/badges/abc' },
        ],
      },
    ],
  };
  const latex = renderResumeLatex(structure);
  assert.ok(latex.includes('credly.com/badges/abc'), 'the address is on the page');
  assert.ok(latex.includes('Amazon Web Services $|$ \\href'), 'beside the issuer, not instead of it');
});

test('an entry with no link prints exactly as it did before', () => {
  const structure: ResumeStructure = { ...base, sections: undefined };
  const latex = renderResumeLatex(structure);
  assert.ok(latex.includes('\\resumeSubheading{Engineer}{2022 - Present}{Acme}{Remote}'));
  assert.ok(!latex.includes('$|$ \\href'), 'no dangling separator');
});

test('a certificate in progress is Expected, not Present', () => {
  // "Started Jan 2026 – Present" is right for a role and wrong for something
  // you are studying towards.
  assert.strictEqual(
    formatDates({ startMonth: 1, startYear: 2026, endMonth: 5, endYear: 2026, isCurrent: true }, 'certifications'),
    'Jan 2026 – May 2026 (Expected)',
  );
  assert.strictEqual(
    formatDates({ startMonth: 1, startYear: 2026, endMonth: null, endYear: null, isCurrent: true }, 'experience'),
    'Jan 2026 – Present',
  );
  assert.strictEqual(
    formatDates({ startMonth: 1, startYear: 2026, endMonth: null, endYear: null, isCurrent: true }, 'extracurricular'),
    'Jan 2026 – Present',
  );
});

test('Contact is not ticked while it is the thing holding everything up', () => {
  // Polish and Download stay shut until the contact form has been saved, and
  // the rail was showing a green tick and "Name and email set" on that exact
  // section — so there was nothing on screen saying where to go, and the answer
  // was to ask whoever built it.
  const before = sectionStatus(base, false).find((s) => s.key === 'contact')!;
  assert.strictEqual(before.done, false);
  assert.strictEqual(before.detail, 'Not saved yet');

  const after = sectionStatus(base, true).find((s) => s.key === 'contact')!;
  assert.strictEqual(after.done, true);
  assert.strictEqual(after.detail, 'Name and email set');
});

test('a contact with no email says what is missing, saved or not', () => {
  const empty: ResumeStructure = { ...base, name: '', contact: {} };
  for (const saved of [true, false]) {
    const row = sectionStatus(empty, saved).find((s) => s.key === 'contact')!;
    assert.strictEqual(row.done, false);
    assert.strictEqual(row.detail, 'Name and email needed');
  }
});

// ── Headings, however they are spelled ─────────────────────────────────────

test('a compound heading still names the section it is', () => {
  // "Awards & Honors" is one spelling of the same section out of a hundred, and
  // an exact-match table is always one spelling behind. Left as its own key it
  // printed twice: once as "Awards & Honors" from the section, once as "Awards"
  // from the flat field the extractor also filled.
  for (const heading of ['Awards & Honors', 'Honors & Awards', 'Awards and Honours', 'Scholarships & Awards']) {
    assert.strictEqual(keyFor(heading), 'awards', heading);
  }
  for (const heading of ['Certifications & Licenses', 'Licenses & Certifications', 'Credentials']) {
    assert.strictEqual(keyFor(heading), 'certifications', heading);
  }
  assert.strictEqual(keyFor('Skills & Abilities'), 'skills');
  assert.strictEqual(keyFor('Summary of Qualifications'), 'summary');
  assert.strictEqual(keyFor('Education & Training'), 'education');
});

test('a qualifier that changes the section is left alone', () => {
  // This is the reason experience has no word list. "Volunteer Experience" is
  // not somebody's job history, and folding it in would merge their
  // volunteering into their employment.
  assert.strictEqual(keyFor('Volunteer Experience'), 'volunteer_experience');
  assert.strictEqual(keyFor('Research Experience'), 'research_experience');
  assert.strictEqual(keyFor('Leadership Experience'), 'leadership_experience');
  assert.strictEqual(keyFor('Extracurricular & Community Activities'), 'extracurricular_community_activities');
});

test('the compound headings that were already decided still hold', () => {
  assert.strictEqual(keyFor('Work Experience'), 'experience');
  assert.strictEqual(keyFor('Professional Experience'), 'experience');
  assert.strictEqual(keyFor('Technical Projects'), 'projects');
  assert.strictEqual(keyFor('Technical Skills'), 'skills');
});

// ── Adding and removing ────────────────────────────────────────────────────

const PLAN: ResumeSection[] = [
  { key: 'education', label: 'Education' },
  { key: 'experience', label: 'Work Experience' },
  { key: 'projects', label: 'Technical Projects' },
  { key: 'skills', label: 'Technical Skills' },
];

test('a Summary lands at the top, where a summary goes', () => {
  const next = withSectionAdded(PLAN, 'Summary', 'prose')!;
  assert.deepStrictEqual(next.map((s) => s.key), [
    'summary', 'education', 'experience', 'projects', 'skills',
  ]);
  assert.strictEqual(next[0].shape, 'prose');
});

test('certifications land after skills, awards after certifications', () => {
  const withCerts = withSectionAdded(PLAN, 'Certifications', 'entries')!;
  assert.deepStrictEqual(withCerts.map((s) => s.key).slice(-1), ['certifications']);
  const withBoth = withSectionAdded(withCerts, 'Awards', 'entries')!;
  assert.deepStrictEqual(withBoth.map((s) => s.key).slice(-2), ['certifications', 'awards']);
});

test('a section the app has no place for goes last, where it was asked for', () => {
  const next = withSectionAdded(PLAN, 'Volunteer Experience', 'entries')!;
  assert.strictEqual(next[next.length - 1].key, 'volunteer_experience');
  assert.strictEqual(next[next.length - 1].label, 'Volunteer Experience');
});

test('a conventional position is honoured even when the plan is reordered', () => {
  // Polish may have put projects above experience.
  const reordered: ResumeSection[] = [
    { key: 'education', label: 'Education' },
    { key: 'projects', label: 'Projects' },
    { key: 'experience', label: 'Experience' },
  ];
  assert.deepStrictEqual(withSectionAdded(reordered, 'Summary', 'prose')!.map((s) => s.key), [
    'summary', 'education', 'projects', 'experience',
  ]);
});

test('a section they already have is refused rather than duplicated', () => {
  assert.strictEqual(withSectionAdded(PLAN, 'Experience', 'entries'), null);
  // And through the back door: a different spelling of the same section.
  const withAwards = withSectionAdded(PLAN, 'Awards & Honours', 'entries')!;
  assert.strictEqual(withSectionAdded(withAwards, 'Awards', 'entries'), null);
  assert.strictEqual(withSectionAdded(withAwards, 'Honors & Awards', 'entries'), null);
});

test('a known key keeps its own shape, unless it is one of the flexible two', () => {
  // Nothing should make a summary render as a list of jobs.
  assert.strictEqual(withSectionAdded(PLAN, 'Summary', 'entries')![0].shape, 'prose');
  // Certifications and Awards are the resume's to shape.
  const certs = withSectionAdded(PLAN, 'Certifications', 'entries')!.find((s) => s.key === 'certifications');
  assert.strictEqual(certs!.shape, 'entries');
});

test('removing takes one out and leaves the rest alone', () => {
  const withSummary = withSectionAdded(PLAN, 'Summary', 'prose')!;
  assert.deepStrictEqual(withSectionRemoved(withSummary, 'summary').map((s) => s.key), [
    'education', 'experience', 'projects', 'skills',
  ]);
});

test('the four the fallback restores are not offered as removable', () => {
  for (const key of ['education', 'experience', 'projects', 'skills']) {
    assert.strictEqual(isRemovable(key), false, key);
  }
  for (const key of ['summary', 'certifications', 'awards', 'volunteering']) {
    assert.strictEqual(isRemovable(key), true, key);
  }
});

// ── The one answer ─────────────────────────────────────────────────────────

test('a profile with no rows owns the four, not all seven', () => {
  // planSections describes where things GO. ownSections says what EXISTS, and
  // seeding a plan from the wrong one puts Certifications and Awards in the
  // rail of somebody who has neither.
  assert.deepStrictEqual(ownSections(base).map((s) => s.key), [
    'education', 'experience', 'projects', 'skills',
  ]);
});

test('a section declared but not yet filled in is still owned', () => {
  // This is what stops a just-added section being deleted by the next polish.
  const justAdded: ResumeStructure = {
    ...base,
    sections: [{ key: 'summary', label: 'Summary', shape: 'prose', text: '' }],
  };
  assert.ok(ownSections(justAdded).some((s) => s.key === 'summary'));
});

test('a section with content but no row is owned too', () => {
  // A profile that predates the sections table.
  assert.ok(ownSections({ ...base, summary: 'Ships software.' }).some((s) => s.key === 'summary'));
});

test('every section the catalogue offers can actually be added', () => {
  // The cap used to make this false: four core sections plus the catalogue came
  // to more than it allowed, so a section could be offered and then refused for
  // being one too many.
  let plan: ResumeSection[] = [
    { key: 'education', label: 'Education' },
    { key: 'experience', label: 'Experience' },
    { key: 'projects', label: 'Projects' },
    { key: 'skills', label: 'Technical Skills' },
  ];
  for (const a of ADDABLE) {
    const next = withSectionAdded(plan, a.label, a.shape);
    assert.ok(next, `${a.label} was refused`);
    plan = next;
  }
  assert.strictEqual(plan.length, 4 + ADDABLE.length);
});

test('the catalogue has no two entries that resolve to one section', () => {
  // Two rows both landing on `awards` would offer a duplicate that the server
  // then refuses on click.
  const keys = ADDABLE.map((a) => keyFor(a.label));
  assert.strictEqual(new Set(keys).size, keys.length, keys.join(', '));
});

test('sections named by hand keep their own identity', () => {
  // "Something else…" is the escape hatch for everything not on the list, and
  // the danger is a name being swallowed by a section it merely resembles.
  const plan: ResumeSection[] = [{ key: 'experience', label: 'Experience' }];
  for (const [label, expected] of [
    ['Leadership', 'leadership'],
    ['Professional Development', 'professional_development'],
    ['Conferences & Talks', 'conferences_talks'],
    ['Memberships', 'memberships'],
    ['Patents', 'patents'],
  ] as const) {
    const next = withSectionAdded(plan, label, 'entries');
    assert.ok(next, `${label} was refused`);
    assert.strictEqual(next[next.length - 1].key, expected, label);
  }
});

// ── Renaming ───────────────────────────────────────────────────────────────

test('renaming changes the label and never the key', () => {
  // The key is what every entry is filed under. Changing it would mean
  // re-filing all of them on each rename, for nothing anybody can see.
  const plan: ResumeSection[] = [
    { key: 'volunteer_experience', label: 'Volunteer Experience', shape: 'entries' },
    { key: 'experience', label: 'Experience' },
  ];
  const next = withSectionRenamed(plan, 'volunteer_experience', 'Community Work')!;
  assert.strictEqual(next[0].key, 'volunteer_experience');
  assert.strictEqual(next[0].label, 'Community Work');
  assert.strictEqual(next[0].shape, 'entries', 'and nothing else moves');
});

test('the four the app knows can be renamed too', () => {
  // Polish already renames these, so a person should be able to.
  const plan: ResumeSection[] = [{ key: 'experience', label: 'Experience' }];
  assert.strictEqual(withSectionRenamed(plan, 'experience', 'Work History')![0].label, 'Work History');
  assert.strictEqual(withSectionRenamed(plan, 'experience', 'Work History')![0].key, 'experience');
});

test('a name that is really another section they have is refused', () => {
  // Two headings both reading "Awards" with different things underneath.
  const plan: ResumeSection[] = [
    { key: 'awards', label: 'Awards & Honours', shape: 'entries' },
    { key: 'volunteer_experience', label: 'Volunteer Experience', shape: 'entries' },
  ];
  assert.strictEqual(withSectionRenamed(plan, 'volunteer_experience', 'Awards'), null);
  assert.strictEqual(withSectionRenamed(plan, 'volunteer_experience', 'Honors & Awards'), null);
  // But a spelling of its OWN name is fine — that is the whole point.
  assert.strictEqual(withSectionRenamed(plan, 'awards', 'Honours & Awards')![0].label, 'Honours & Awards');
});

test('an empty name, or a section that is not there, is refused', () => {
  const plan: ResumeSection[] = [{ key: 'awards', label: 'Awards' }];
  assert.strictEqual(withSectionRenamed(plan, 'awards', '   '), null);
  assert.strictEqual(withSectionRenamed(plan, 'nope', 'Anything'), null);
});
