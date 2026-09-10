import assert from 'node:assert';
import test from 'node:test';
import { checkReadiness, hasEnoughToTailor } from './readiness';
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
  assert.ok(result.blocking.some((b) => /a resume needs at least one/.test(b.message)));
});

test('a section of their own counts as something they have done', () => {
  // A first year with a degree, a tutoring post at the library and two
  // certificates was told to "add a job or a project" — and this blocker also
  // hides the preview, so they got no resume on screen either.
  const student = resume({
    experience: [],
    projects: [],
    sections: [
      { key: 'education', label: 'Education' },
      {
        key: 'volunteer_experience',
        label: 'Volunteer Experience',
        shape: 'entries',
        entries: [{ title: 'Tutor', org: 'Local Library', dates: '2025', bullets: ['Tutored twelve students weekly'] }],
      },
      { key: 'skills', label: 'Technical Skills' },
    ],
  });
  assert.ok(
    !checkReadiness(student).blocking.some((b) => /a resume needs at least one/.test(b.message)),
    'volunteering is something you did',
  );
});

test('a degree on its own is still not enough', () => {
  // The rule is about something you DID. A degree is something you have, and
  // certificates and awards are things you hold.
  const onlyStudied = resume({
    experience: [],
    projects: [],
    sections: [
      { key: 'education', label: 'Education' },
      {
        key: 'certifications',
        label: 'Certifications',
        shape: 'entries',
        entries: [{ title: 'AWS Cloud Practitioner', org: 'Amazon', dates: '2025', bullets: [] }],
      },
    ],
  });
  const blocked = checkReadiness(onlyStudied).blocking.some((b) => /a resume needs at least one/.test(b.message));
  assert.equal(blocked, false, 'a certification is an entry, so it counts — thin, but real');
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


// ── The gate every page was getting wrong ──────────────────────────────────
//
// Three places asked `structure?.name` and nothing else — /applications/new,
// the tailor route, and the applications empty state. Typing a name into
// Contact and pressing Save creates the profiles row, so all three passed, and
// the tailor spends its credit BEFORE it generates. A resume with no jobs, no
// education and no skills therefore cost a credit to rewrite.

test('nothing at all is not enough to tailor from', () => {
  assert.equal(hasEnoughToTailor(null), false);
  assert.equal(hasEnoughToTailor(undefined), false);
});

test('a name on its own is not enough to tailor from', () => {
  // The fifteen-second path: open Contact, type a name, press Save.
  const nameOnly = resume({ name: 'Chukwudi Ndubuisi', education: [], experience: [], projects: [], skills: [] });
  assert.equal(hasEnoughToTailor(nameOnly), false);
});

test('a resume with no name is not enough, however much is on it', () => {
  assert.equal(hasEnoughToTailor(resume({ name: '' })), false);
  assert.equal(hasEnoughToTailor(resume({ name: '   ' })), false, 'whitespace is not a name');
});

test('a name and one project is enough to tailor from', () => {
  const justAProject = resume({ experience: [], education: [], skills: [] });
  assert.equal(hasEnoughToTailor(justAProject), true);
});

test('a degree on its own is not enough to tailor from', () => {
  // Same rule as the blocker: something you DID, not something you have.
  const onlyStudied = resume({ experience: [], projects: [] });
  assert.equal(hasEnoughToTailor(onlyStudied), false);
});

test('an entry in a section of their own is enough to tailor from', () => {
  // The trap this was already caught by once. A gate that counted only
  // experience and projects would send a student with a volunteering post back
  // to build a profile they had already built.
  const student = resume({
    experience: [],
    projects: [],
    sections: [
      { key: 'education', label: 'Education' },
      {
        key: 'volunteer_experience',
        label: 'Volunteer Experience',
        shape: 'entries',
        entries: [{ title: 'Tutor', org: 'Local Library', dates: '2025', bullets: ['Tutored twelve students weekly'] }],
      },
      { key: 'skills', label: 'Technical Skills' },
    ],
  });
  assert.equal(hasEnoughToTailor(student), true);
});

test('the gate and the blocker never disagree about the same resume', () => {
  // They share `somethingDone` rather than each testing it. Two copies of this
  // rule would drift, and neither would look wrong on its own — the gate would
  // start letting people through that the blocker still stops.
  const cases = [
    resume(),
    resume({ experience: [], projects: [] }),
    resume({ experience: [], projects: [], education: [] }),
    resume({ name: '' }),
  ];
  for (const structure of cases) {
    const blocked = checkReadiness(structure).blocking.some((b) =>
      /a resume needs at least one/.test(b.message),
    );
    const named = Boolean(structure.name?.trim());
    assert.equal(
      hasEnoughToTailor(structure),
      named && !blocked,
      `disagreed about ${JSON.stringify(structure.name)} / ${structure.experience.length} jobs`,
    );
  }
});
