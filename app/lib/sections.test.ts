import assert from 'node:assert';
import test from 'node:test';
import {
  CONVENTIONAL_ORDER,
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
import type { ResumeStructure } from './types';

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

test('rows with only a title are inline, like projects', () => {
  assert.strictEqual(inferShape({ entries: [{ title: 'A Paper' }, { title: 'Another' }] }), 'inline');
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
