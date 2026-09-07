import assert from 'node:assert';
import test from 'node:test';
import { abbreviateRegion, formatDates, formatPhone, formatPlace, formatWebsite, parseDates, parsePlace, readsTheSame, recencyKey, structuredDates, structuredPlace, type DateParts } from './entryFormat';

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
  assert.equal(out, '2022 – 2028 (Expected)', 'a degree is worked towards, not something you are "in"');
  assert.doesNotMatch(out, /Present/);
});

test('a degree in progress keeps both ends, because the span is the point', () => {
  // How long they have been at it is what a reader weighs when they see an
  // unfinished degree, so dropping the start throws away the useful half.
  assert.equal(
    formatDates(dates({ startMonth: 9, startYear: 2023, endMonth: 5, endYear: 2028, isCurrent: true }), 'education'),
    'Sep 2023 – May 2028 (Expected)',
  );
  // With no start there is no range to state.
  assert.equal(
    formatDates(dates({ endMonth: 5, endYear: 2028, isCurrent: true }), 'education'),
    'Expected May 2028',
  );
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
  assert.equal(
    formatPlace(place, null, 'United States'),
    'Toronto, ON',
    'ON is recognisable on its own — real resumes put "Oshawa, ON" and "San Francisco, CA" on the same page',
  );
  assert.equal(formatPlace(place), 'Toronto, ON', 'a known region code carries its own country');
  assert.equal(
    formatPlace({ city: 'Munich', region: 'Bavaria', country: 'Germany' }),
    'Munich, Bavaria, Germany',
    'an unfamiliar region does not imply its country, so the country stays',
  );
  assert.equal(
    formatPlace({ city: 'Port Harcourt', region: null, country: 'Nigeria' }),
    'Port Harcourt, Nigeria',
    'with no region the country is the only thing placing it',
  );
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

test('a region typed out in full is abbreviated the way a resume writes it', () => {
  // People type "California" into a box labelled region, which is correct and
  // also not what belongs on the page.
  assert.equal(abbreviateRegion('California'), 'CA');
  assert.equal(abbreviateRegion('ontario'), 'ON');
  assert.equal(abbreviateRegion('ON'), 'ON', 'an existing code is left alone');
  assert.equal(abbreviateRegion('Bavaria'), 'Bavaria', 'unknown regions pass through unchanged');
  assert.equal(
    formatPlace({ city: 'San Francisco', region: 'California', country: 'USA' }),
    'San Francisco, CA',
  );
});

test('a bare run of digits becomes a phone number', () => {
  assert.equal(formatPhone('9059225891'), '905-922-5891');
  assert.equal(formatPhone('19059225891'), '905-922-5891', 'a leading country code is dropped');
});

test('a phone someone already formatted is left exactly alone', () => {
  // Someone who typed punctuation meant it, and an international number
  // reformatted to a North American pattern is worse than what they wrote.
  assert.equal(formatPhone('(905) 922-5891'), '(905) 922-5891');
  assert.equal(formatPhone('+44 20 7946 0958'), '+44 20 7946 0958');
  assert.equal(formatPhone('905.922.5891'), '905.922.5891');
});

test('a website shows as its domain', () => {
  assert.equal(formatWebsite('https://meetalexius.com'), 'meetalexius.com');
  assert.equal(formatWebsite('https://www.meetalexius.com/'), 'meetalexius.com');
  assert.equal(formatWebsite('github.com/chukwudican-sudo'), 'github.com/chukwudican-sudo');
});

// ── Reading dates back off a resume ────────────────────────────────────────

const ACCEPTED: [string, string, DateParts][] = [
  ['Nov 2025 – May 2026', 'experience', { startMonth: 11, startYear: 2025, endMonth: 5, endYear: 2026, isCurrent: false }],
  ['Jan 2024 - Dec 2024', 'experience', { startMonth: 1, startYear: 2024, endMonth: 12, endYear: 2024, isCurrent: false }],
  ['June 2026 – Present', 'project', { startMonth: 6, startYear: 2026, endMonth: null, endYear: null, isCurrent: true }],
  ['Aug 2026', 'project', { startMonth: 8, startYear: 2026, endMonth: null, endYear: null, isCurrent: false }],
  ['2023 – 2028', 'education', { startMonth: null, startYear: 2023, endMonth: null, endYear: 2028, isCurrent: false }],
  ['05/2025 – 08/2026', 'experience', { startMonth: 5, startYear: 2025, endMonth: 8, endYear: 2026, isCurrent: false }],
  ['2023-09 – 2028-05', 'education', { startMonth: 9, startYear: 2023, endMonth: 5, endYear: 2028, isCurrent: false }],
  ['May – Aug 2025', 'experience', { startMonth: 5, startYear: 2025, endMonth: 8, endYear: 2025, isCurrent: false }],
  ['Sep 2023 – May 2028 (Expected)', 'education', { startMonth: 9, startYear: 2023, endMonth: 5, endYear: 2028, isCurrent: true }],
];

test('real resume date strings are read into parts', () => {
  for (const [input, , expected] of ACCEPTED) {
    assert.deepEqual(parseDates(input), expected, `parsing "${input}"`);
  }
});

test('what cannot be placed comes back empty rather than approximate', () => {
  const empty: DateParts = { startMonth: null, startYear: null, endMonth: null, endYear: null, isCurrent: false };
  for (const input of ['', '   ', 'Various', 'two years', '1066', '3025', 'May-Aug-2025']) {
    assert.deepEqual(parseDates(input), { ...empty, isCurrent: parseDates(input).isCurrent }, `"${input}"`);
    assert.equal(parseDates(input).startYear, null, `"${input}" has no year`);
    assert.equal(parseDates(input).endYear, null, `"${input}" has no year`);
  }
  assert.deepEqual(parseDates(null), empty);
});

test('the round trip is the contract, not a coincidence', () => {
  // Every string we accept must re-render to something that says the same
  // thing. This is what makes writing the parts safe.
  for (const [input, kind, expected] of ACCEPTED) {
    assert.equal(readsTheSame(input, expected, kind), true, `"${input}" must round-trip`);
  }
});

test('a date that would lose something on the way back is not stored', () => {
  const empty: DateParts = { startMonth: null, startYear: null, endMonth: null, endYear: null, isCurrent: false };

  // The season is information a reader uses; rendering "2025" would drop it.
  assert.deepEqual(structuredDates('Summer 2025', 'experience'), empty);
  // A day is not a month, and 05/06 could be either way round.
  assert.deepEqual(structuredDates('05/06/2025', 'project'), empty);
  // Nothing to order by.
  assert.deepEqual(structuredDates('Ongoing', 'experience'), { ...empty, isCurrent: false });
  assert.deepEqual(structuredDates('', 'experience'), empty);
  assert.deepEqual(structuredDates(null, 'experience'), empty);
});

test('the same string can be storable for one kind and not another', () => {
  // Education renders "(Expected)" and keeps the finish date; experience would
  // render "Sep 2023 – Present" and lose it, so it is refused there.
  const input = 'Sep 2023 – May 2028 (Expected)';
  assert.equal(structuredDates(input, 'education').endYear, 2028);
  assert.equal(structuredDates(input, 'experience').startYear, null);
});

test('a place is split only when it is shaped like one', () => {
  assert.deepEqual(structuredPlace('San Francisco, CA'), { city: 'San Francisco', region: 'CA', country: null });
  assert.deepEqual(structuredPlace('Toronto, ON, Canada'), { city: 'Toronto', region: 'ON', country: 'Canada' });
  assert.deepEqual(structuredPlace('Remote'), { city: 'Remote', region: null, country: null });

  const none = { city: null, region: null, country: null };
  // parsePlace keeps the first three pieces and drops the rest silently, so
  // anything that is not a place must not reach it.
  assert.deepEqual(structuredPlace('123 King St W, Toronto, ON M5V 2T6'), none);
  assert.deepEqual(structuredPlace('A, B, C, D'), none);
  assert.deepEqual(structuredPlace(''), none);
  assert.deepEqual(structuredPlace(null), none);
});
