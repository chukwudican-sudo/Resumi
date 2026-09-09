import assert from 'node:assert/strict';
import test from 'node:test';
import { splitFlatEntries, splitFlatEntry } from './flatEntry';

test('the exact strings a real upload produced', () => {
  assert.deepEqual(splitFlatEntry("Dean's Honour List — Ontario Tech University, 2025"), {
    title: "Dean's Honour List",
    org: 'Ontario Tech University',
    dates: '2025',
  });
  assert.deepEqual(splitFlatEntry('Hackathon Top Placement (test entry) — Sample Hackathon Organizer, 2026'), {
    title: 'Hackathon Top Placement (test entry)',
    org: 'Sample Hackathon Organizer',
    dates: '2026',
  });
});

test('commas instead of a dash', () => {
  assert.deepEqual(splitFlatEntry('Microsoft Certified: Azure Fundamentals (AZ-900), Microsoft, 2027'), {
    title: 'Microsoft Certified: Azure Fundamentals (AZ-900)',
    org: 'Microsoft',
    dates: '2027',
  });
});

test('a date range, and a credential still running', () => {
  assert.deepEqual(splitFlatEntry('AWS Certified Cloud Practitioner — Amazon Web Services, Jun 2025 – Jun 2028'), {
    title: 'AWS Certified Cloud Practitioner',
    org: 'Amazon Web Services',
    dates: 'Jun 2025 – Jun 2028',
  });
  assert.equal(splitFlatEntry('Some Licence — A Board, 2024 – Present')?.dates, '2024 – Present');
});

test('an issuer with no date, and a date with no issuer', () => {
  assert.deepEqual(splitFlatEntry("Dean's List — Ontario Tech University"), {
    title: "Dean's List",
    org: 'Ontario Tech University',
    dates: '',
  });
  assert.deepEqual(splitFlatEntry("Dean's List, 2025"), { title: "Dean's List", org: '', dates: '2025' });
});

test('a sentence about an achievement is left alone', () => {
  // Indeed's own example style. Three fields would be an invention.
  for (const line of [
    'Named in the "Top 50 Health Blogs and Websites of 2022" by Health and Wellness Magazine',
    'Awarded Website of the Year by Web Professionals for exceptional user experience design',
    "Dean's Honour List",
    'Employee of the Month',
  ]) {
    assert.equal(splitFlatEntry(line), null, line);
  }
});

test('a year in the middle of a sentence is not the entry date', () => {
  assert.equal(splitFlatEntry('Top 50 Blogs of 2022 by Health Magazine'), null);
});

test('a dash beats a comma, so a title keeps its commas', () => {
  assert.deepEqual(splitFlatEntry('Best Paper, Runner Up — ACM SIGCHI, 2024'), {
    title: 'Best Paper, Runner Up',
    org: 'ACM SIGCHI',
    dates: '2024',
  });
});

test('a section splits only when every line does', () => {
  assert.ok(splitFlatEntries(["A — Org, 2025", 'B — Org, 2024']));
  assert.equal(
    splitFlatEntries(["Dean's Honour List — Ontario Tech University, 2025", 'Employee of the Month']),
    null,
    'half and half reads as a mistake on the page',
  );
  assert.equal(splitFlatEntries([]), null);
  assert.equal(splitFlatEntries(['   ']), null);
});
