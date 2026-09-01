import assert from 'node:assert';
import test from 'node:test';
import { buildResume, isResumeUsable, sectionStatus, type ContactFact, type EntryWithBullets } from './buildResume';

let seq = 0;
function entry(over: Partial<EntryWithBullets> = {}): EntryWithBullets {
  seq += 1;
  return {
    id: `e${seq}`,
    kind: 'experience',
    orderIndex: 0,
    source: 'manual',
    bullets: [],
    ...over,
  };
}

const contactFacts: ContactFact[] = [
  { category: 'identity', text: 'Name: Alex Ndubuisi' },
  { category: 'identity', text: 'Email: alex@example.com' },
  { category: 'identity', text: 'Phone: (416) 555-0134' },
  { category: 'identity', text: 'LinkedIn: linkedin.com/in/alex' },
];

test('what the person typed comes back verbatim', () => {
  const bullets = ['Rebuilt the payment retry pipeline in Python and Celery'];
  const resume = buildResume(
    [entry({ kind: 'experience', title: 'Backend Intern', org: 'Northbound', datesDisplay: 'Summer 2025', bullets })],
    contactFacts,
  );

  assert.equal(resume.name, 'Alex Ndubuisi');
  assert.equal(resume.contact.email, 'alex@example.com');
  assert.deepEqual(
    resume.experience[0].bullets,
    bullets,
    'the renderer must not reword anything — that is the whole point of it being deterministic',
  );
});

test('entries render into the right sections', () => {
  const resume = buildResume(
    [
      entry({ kind: 'experience', title: 'Engineer', org: 'Acme' }),
      entry({ kind: 'project', title: 'Resumi', tech: 'Next.js, TypeScript' }),
      entry({ kind: 'education', title: 'BSc Software Engineering', org: 'Ontario Tech' }),
    ],
    contactFacts,
  );

  assert.equal(resume.experience.length, 1);
  assert.equal(resume.projects.length, 1);
  assert.equal(resume.education.length, 1);
  assert.equal(resume.projects[0].tech, 'Next.js, TypeScript');
  assert.equal(resume.education[0].school, 'Ontario Tech', 'education uses org as the school');
});

test('entries come out in order, most recent first', () => {
  const resume = buildResume(
    [
      entry({ kind: 'experience', title: 'Older', orderIndex: 2 }),
      entry({ kind: 'experience', title: 'Newest', orderIndex: 0 }),
      entry({ kind: 'experience', title: 'Middle', orderIndex: 1 }),
    ],
    contactFacts,
  );

  assert.deepEqual(resume.experience.map((e) => e.title), ['Newest', 'Middle', 'Older']);
});

test('skills group by their label and merge', () => {
  const resume = buildResume([], [
    ...contactFacts,
    { category: 'skill', text: 'Languages: Python, TypeScript' },
    { category: 'skill', text: 'Languages: Go' },
    { category: 'skill', text: 'Tools: Docker' },
  ]);

  const languages = resume.skills.find((s) => s.category === 'Languages');
  assert.equal(languages?.items, 'Python, TypeScript, Go', 'two facts in one group become one line');
  assert.equal(resume.skills.find((s) => s.category === 'Tools')?.items, 'Docker');
});

test('an unlabelled skill still lands somewhere', () => {
  const resume = buildResume([], [...contactFacts, { category: 'skill', text: 'Kubernetes' }]);
  assert.equal(resume.skills[0].category, 'Skills');
  assert.equal(resume.skills[0].items, 'Kubernetes');
});

test('empty contact fields are omitted rather than rendered blank', () => {
  const resume = buildResume([], [{ category: 'identity', text: 'Name: Alex' }]);
  assert.equal(resume.contact.email, undefined);
  assert.equal(resume.contact.phone, undefined);
});

test('section status says what is missing, not a percentage', () => {
  const status = sectionStatus([entry({ kind: 'experience', title: 'Engineer' })], contactFacts);

  const byKey = Object.fromEntries(status.map((s) => [s.key, s]));
  assert.equal(byKey.contact.done, true);
  assert.equal(byKey.experience.done, true);
  assert.equal(byKey.experience.detail, '1 added');
  assert.equal(byKey.education.done, false);
  assert.equal(byKey.education.detail, 'None yet');
  assert.equal(byKey.projects.detail, 'Optional', 'projects are not required to have a resume');
});

test('a resume is usable once someone is reachable and has done something', () => {
  assert.equal(isResumeUsable([], contactFacts), false, 'contact alone is not a resume');
  assert.equal(
    isResumeUsable([entry({ kind: 'education', title: 'BSc' })], contactFacts),
    false,
    'education alone is not something to tailor',
  );
  assert.equal(isResumeUsable([entry({ kind: 'experience' })], contactFacts), true);
  assert.equal(
    isResumeUsable([entry({ kind: 'project' })], contactFacts),
    true,
    'a project counts — someone with no jobs yet still has a resume',
  );
  assert.equal(
    isResumeUsable([entry({ kind: 'experience' })], [{ category: 'identity', text: 'Name: Alex' }]),
    false,
    'no email means nobody can reply',
  );
});
