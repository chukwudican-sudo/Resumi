import assert from 'node:assert';
import test from 'node:test';
import { formatDates, formatPlace, parsePlace, recencyKey, type DateParts } from './entryFormat';

function dates(over: Partial<DateParts> = {}): DateParts {
  return { startMonth: null, startYear: null, endMonth: null, endYear: null, isCurrent: false, ...over };
}

test('a finished range reads month and year at both ends', () => {
  const out = formatDates(dates({ startMonth: 5, startYear: 2025, endMonth: 8, endYear: 2025 }), 'experience');
  assert.equal(out, 'May 2025 – Aug 2025');
});

test('a current job says Present', () => {
  const out = formatDates(dates({ startMonth: 1, startYear: 2024, isCurrent: true }), 'experience');
  assert.equal(out, 'Jan 2024 – Present');
});

test('an unfinished degree says Expected, not Present', () => {
  const out = formatDates(dates({ startYear: 2022, endYear: 2028, isCurrent: true }), 'education');
  assert.equal(out, 'Expected 2028', 'a degree is a date you are working towards, not one you are in');
});

test('years alone are fine when the month is not known', () => {
  assert.equal(formatDates(dates({ startYear: 2022, endYear: 2026 }), 'education'), '2022 – 2026');
});

test('a single point does not render as a range', () => {
  assert.equal(formatDates(dates({ startMonth: 6, startYear: 2024 }), 'project'), 'Jun 2024');
  assert.equal(
    formatDates(dates({ startMonth: 6, startYear: 2024, endMonth: 6, endYear: 2024 }), 'project'),
    'Jun 2024',
    'the same month at both ends is one date, not a range to itself',
  );
});

test('an imported entry falls back rather than showing nothing', () => {
  assert.equal(formatDates(dates(), 'experience', 'Summer 2025'), 'Summer 2025');
  assert.equal(formatDates(dates(), 'experience'), '');
});

test('structured dates win over the imported string', () => {
  const out = formatDates(dates({ startYear: 2025, endYear: 2025 }), 'experience', 'whenever');
  assert.equal(out, '2025');
});

test('a place reads city and region', () => {
  assert.equal(formatPlace({ city: 'Toronto', region: 'ON', country: null }), 'Toronto, ON');
});

test('the country is dropped when it matches where they are', () => {
  const place = { city: 'Toronto', region: 'ON', country: 'Canada' };
  assert.equal(
    formatPlace(place, null, 'Canada'),
    'Toronto, ON',
    'telling a Canadian employer the job was in Canada states the obvious',
  );
  assert.equal(formatPlace(place, null, 'United States'), 'Toronto, ON, Canada');
  assert.equal(formatPlace(place), 'Toronto, ON, Canada', 'no home country means keep it');
});

test('country matching ignores case and spacing', () => {
  const place = { city: 'Toronto', region: 'ON', country: 'canada' };
  assert.equal(formatPlace(place, null, '  Canada '), 'Toronto, ON');
});

test('a place with only a country still renders', () => {
  assert.equal(formatPlace({ city: null, region: null, country: 'Remote' }), 'Remote');
});

test('an imported location string splits into parts', () => {
  assert.deepEqual(parsePlace('Toronto, ON, Canada'), { city: 'Toronto', region: 'ON', country: 'Canada' });
  assert.deepEqual(parsePlace('Remote'), { city: 'Remote', region: null, country: null });
  assert.deepEqual(parsePlace(null), { city: null, region: null, country: null });
});

test('current entries sort above everything finished', () => {
  const current = recencyKey(dates({ startYear: 2020, isCurrent: true }));
  const recent = recencyKey(dates({ endMonth: 12, endYear: 2026 }));
  assert.ok(current > recent);
});

test('a later end date sorts higher', () => {
  const older = recencyKey(dates({ endMonth: 8, endYear: 2024 }));
  const newer = recencyKey(dates({ endMonth: 1, endYear: 2025 }));
  assert.ok(newer > older);
});
