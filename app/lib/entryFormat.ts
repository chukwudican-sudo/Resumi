/**
 * How dates and places read on a resume.
 *
 * One place, because the failure this replaces was a resume where one job said
 * "May – Aug 2025" and the next said "Summer 2025". A reader notices that, and
 * what it reads as is carelessness — so the format is decided here rather than
 * left to whatever each person typed on the day.
 */

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface DateParts {
  startMonth: number | null;
  startYear: number | null;
  endMonth: number | null;
  endYear: number | null;
  isCurrent: boolean;
}

function point(month: number | null, year: number | null): string {
  if (!year) return '';
  return month ? `${SHORT[month - 1]} ${year}` : String(year);
}

/**
 * Renders a range.
 *
 * `education` says "Expected" rather than "Present" for something unfinished,
 * because a degree in progress is a date you are working towards while a job in
 * progress is one you are in.
 */
export function formatDates(parts: DateParts, kind: string, fallback?: string | null): string {
  const start = point(parts.startMonth, parts.startYear);

  if (parts.isCurrent) {
    const word = kind === 'education' ? 'Expected' : 'Present';
    if (kind === 'education' && parts.endYear) {
      // A degree in progress states both ends. The range says how long they
      // have been at it, which is the part a reader is actually judging when
      // they see an unfinished degree, and it is what a written resume shows:
      // "Sep 2023 – May 2028 (Expected)".
      const finish = point(parts.endMonth, parts.endYear);
      return start ? `${start} – ${finish} (Expected)` : `Expected ${finish}`;
    }
    return start ? `${start} – ${word}` : word;
  }

  const end = point(parts.endMonth, parts.endYear);
  if (start && end) return start === end ? start : `${start} – ${end}`;
  if (start) return start;
  if (end) return end;

  // Nothing structured — fall back to whatever an import gave us rather than
  // showing an entry with no dates at all.
  return fallback?.trim() ?? '';
}

export interface PlaceParts {
  city: string | null;
  region: string | null;
  country: string | null;
}

/**
 * Renders a place.
 *
 * Country is dropped when it matches where the person is applying from, since
 * a resume that says "Toronto, ON, Canada" to a Canadian employer is stating
 * the obvious. Passing no home country keeps it.
 */
export function formatPlace(place: PlaceParts, fallback?: string | null, homeCountry?: string | null): string {
  const parts = [place.city, place.region ? abbreviateRegion(place.region) : null]
    .map((p) => p?.trim())
    .filter(Boolean);
  const country = place.country?.trim();

  if (parts.length === 0 && !country) return fallback?.trim() ?? '';

  const sameCountry =
    country && homeCountry && country.toLowerCase() === homeCountry.trim().toLowerCase();

  // A recognised region code already implies its country, so printing both is
  // redundant: resumes say "San Francisco, CA" and "Oshawa, ON" even on the
  // same page, but "Port Harcourt, Nigeria" — the country earns its place when
  // no region carries it. The check is deliberately narrow: "Bavaria" does not
  // imply Germany to most readers, so that country stays.
  const regionCarriesIt = Boolean(place.region && isKnownRegion(place.region));

  if (country && !sameCountry && !regionCarriesIt) parts.push(country);

  return parts.join(', ');
}

/** Splits an imported "Toronto, ON" style string back into parts, best effort. */
export function parsePlace(value: string | null | undefined): PlaceParts {
  const pieces = (value ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  return {
    city: pieces[0] ?? null,
    region: pieces[1] ?? null,
    country: pieces[2] ?? null,
  };
}

// ── Reading dates back off a resume ────────────────────────────────────────

/**
 * Turning a date string back into parts.
 *
 * An uploaded resume gives us "Nov 2025 – May 2026" and nothing else, so the
 * edit form — which reads month and year columns — showed empty boxes beside a
 * card displaying the date perfectly. The card was reading the string; the form
 * was reading the numbers; nothing converted one into the other.
 *
 * Split into three so the policy can be tested apart from the parsing: what the
 * text says, whether the parts say it back, and whether that is good enough to
 * store.
 */

/**
 * Words that mean "still going".
 *
 * "Expected" sits with "Present" because they are the same state — formatDates
 * already decides which word each kind prints, and a file saying one is
 * describing what the other renders.
 */
const OPEN_ENDED = /\b(present|current|now|ongoing|expected|anticipated|graduating)\b/i;

const MONTH_BY_NAME: Record<string, number> = (() => {
  const table: Record<string, number> = { sept: 9 };
  MONTHS.forEach((name, i) => {
    table[name.toLowerCase()] = i + 1;
    table[SHORT[i].toLowerCase()] = i + 1;
  });
  return table;
})();

function monthNumber(word: string): number | null {
  return MONTH_BY_NAME[word.toLowerCase().replace(/\.$/, '')] ?? null;
}

/** Old enough for a career, far enough ahead for a degree in progress. */
const plausibleYear = (n: number) => n >= 1950 && n <= new Date().getFullYear() + 15;

function normaliseDateText(raw: string): string {
  return raw
    .trim()
    // ISO "2023-09" would be torn in half by the range split below.
    .replace(/\b((?:19|20)\d{2})-(\d{1,2})\b/g, '$2/$1')
    .replace(/\bto\s+(date|present|now)\b/gi, ' present')
    .replace(/\bcurrently\b/gi, 'present')
    .replace(/[[\]()]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function readPoint(text: string): { month: number | null; year: number | null } | null {
  const numeric = /(\d{1,2})\s*\/\s*((?:19|20)\d{2})/.exec(text);
  if (numeric) {
    const month = Number(numeric[1]);
    const year = Number(numeric[2]);
    if (!plausibleYear(year)) return null;
    return { month: month >= 1 && month <= 12 ? month : null, year };
  }

  let month: number | null = null;
  for (const word of text.split(/[^A-Za-z]+/)) {
    const found = word ? monthNumber(word) : null;
    if (found) { month = found; break; }
  }
  const matched = /\b((?:19|20)\d{2})\b/.exec(text);
  const year = matched ? Number(matched[1]) : null;
  if (year !== null && !plausibleYear(year)) return null;
  if (month === null && year === null) return null;
  return { month, year };
}

/**
 * What a date string says, best effort.
 *
 * Deliberately separate from the decision to use it — see structuredDates.
 * Anything it cannot place comes back empty rather than approximate, because a
 * confidently wrong date on a resume is worse than a string nobody parsed.
 */
export function parseDates(value: string | null | undefined): DateParts {
  const empty: DateParts = {
    startMonth: null, startYear: null, endMonth: null, endYear: null, isCurrent: false,
  };

  const text = normaliseDateText(value ?? '');
  if (!text) return empty;

  const isCurrent = OPEN_ENDED.test(text);
  // "Expected May 2028" states a finish, not a start.
  const finishOnly = /^(expected|anticipated|graduating)\b/i.test(text);

  const pieces = text
    .replace(new RegExp(OPEN_ENDED.source, 'gi'), ' ')
    .split(/\s*(?:[–—−]|-{1,2}|\bto\b|\bthrough\b|\buntil\b)\s*/i)
    .map((piece) => piece.trim())
    .filter(Boolean);

  // Three pieces is not a range, it is something we do not understand.
  if (pieces.length > 2) return empty;

  const first = pieces[0] ? readPoint(pieces[0]) : null;
  const second = pieces[1] ? readPoint(pieces[1]) : null;

  let start = pieces.length === 1 && finishOnly ? null : first;
  let end = pieces.length === 1 && finishOnly ? first : second;

  // "May – Aug 2025" writes the shared year once.
  if (start && start.year === null && end?.year) start = { ...start, year: end.year };
  if (end && end.year === null && start?.year) end = { ...end, year: start.year };

  // A month with no year cannot be placed on a page or put in an order.
  if (start && start.year === null) start = null;
  if (end && end.year === null) end = null;

  return {
    startMonth: start?.month ?? null,
    startYear: start?.year ?? null,
    endMonth: end?.month ?? null,
    endYear: end?.year ?? null,
    isCurrent,
  };
}

/** "May – Aug 2025" and "May 2025 – Aug 2025" say the same thing. */
function shareYear(text: string): string {
  return text.replace(
    /^([a-z]{3,9})\.?\s*-\s*([a-z]{3,9})\.?\s+((?:19|20)\d{2})$/,
    (whole, from: string, to: string, year: string) =>
      monthNumber(from) && monthNumber(to) ? `${from} ${year} - ${to} ${year}` : whole,
  );
}

function dateTokens(text: string): string[] {
  return shareYear(
    normaliseDateText(text)
      .toLowerCase()
      .replace(/[–—−]/g, '-')
      .replace(/(\d{1,2})\s*\/\s*((?:19|20)\d{2})/g, '$1 $2'),
  )
    .replace(/[.,:;'’]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (OPEN_ENDED.test(word)) return 'open';
      const month = monthNumber(word);
      if (month) return `m${month}`;
      if (/^\d{1,2}$/.test(word)) return `m${Number(word)}`;
      return word;
    })
    .sort();
}

/**
 * Whether the parts say what the string said.
 *
 * Compared as tokens rather than characters, because formatDates is allowed to
 * tidy — "June" becomes "Jun", "05/2025" becomes "May 2025", a degree in
 * progress says "Expected" where the file said "Present". What it may not do is
 * lose something ("Summer 2025" printing as "2025") or invent one, and a
 * dropped or invented token is exactly what this catches.
 *
 * Not airtight: the comparison is unordered, so a start and end swapped between
 * them would pass. Nothing in parseDates reorders, so that stays theoretical.
 */
export function readsTheSame(original: string, parts: DateParts, kind: string): boolean {
  const rendered = formatDates(parts, kind);
  if (!rendered) return false;
  return dateTokens(original).join(' ') === dateTokens(rendered).join(' ');
}

/**
 * The date columns an imported string earns, or nothing.
 *
 * Nothing is the safe answer: datesDisplay keeps the original and the resume
 * prints exactly what it printed before. Parts are written only when they carry
 * a year — an entry cannot be ordered without one — and only when re-rendering
 * them restates the original. A year-only reading of "Summer 2025" would
 * quietly rewrite somebody's resume to "2025", and the season on an internship
 * is something a reader uses.
 */
export function structuredDates(value: string | null | undefined, kind: string): DateParts {
  const empty: DateParts = {
    startMonth: null, startYear: null, endMonth: null, endYear: null, isCurrent: false,
  };
  const raw = (value ?? '').trim();
  if (!raw) return empty;

  const parts = parseDates(raw);
  if (!parts.startYear && !parts.endYear) return empty;
  return readsTheSame(raw, parts, kind) ? parts : empty;
}

/**
 * The place columns an imported string earns, or nothing.
 *
 * "Toronto, ON" splits cleanly; a mailing address does not, and parsePlace
 * keeps the first three pieces of whatever it is given and drops the rest
 * without saying so.
 */
export function structuredPlace(value: string | null | undefined): PlaceParts {
  const none: PlaceParts = { city: null, region: null, country: null };
  const raw = (value ?? '').trim();
  if (!raw) return none;

  const pieces = raw.split(',').map((piece) => piece.trim()).filter(Boolean);
  if (pieces.length === 0 || pieces.length > 3) return none;
  // A digit or an unusually long piece is a street or a postcode, not a city.
  if (pieces.some((piece) => piece.length > 40 || /\d/.test(piece))) return none;

  return parsePlace(raw);
}

/** Sorts most recent first, using the end date, then the start. */
export function recencyKey(parts: DateParts): number {
  if (parts.isCurrent) return Number.MAX_SAFE_INTEGER;
  const year = parts.endYear ?? parts.startYear ?? 0;
  const month = parts.endMonth ?? parts.startMonth ?? 0;
  return year * 12 + month;
}

/**
 * Provinces and states as a resume writes them.
 *
 * People type "California" into a box labelled region, which is correct and
 * also not how a resume reads — "San Francisco, CA" is the convention, and the
 * long form looks like a form field that leaked onto the page. Deterministic on
 * purpose: this is a lookup, not a judgment, so it should not cost a model call.
 */
const REGIONS: Record<string, string> = {
  // Canada
  alberta: 'AB', 'british columbia': 'BC', manitoba: 'MB', 'new brunswick': 'NB',
  'newfoundland and labrador': 'NL', 'nova scotia': 'NS', ontario: 'ON',
  'prince edward island': 'PE', quebec: 'QC', 'québec': 'QC', saskatchewan: 'SK',
  'northwest territories': 'NT', nunavut: 'NU', yukon: 'YT',
  // United States
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS',
  kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA',
  michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
  nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX',
  utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
};

export function abbreviateRegion(region: string): string {
  const trimmed = region.trim();
  return REGIONS[trimmed.toLowerCase()] ?? trimmed;
}

/** True when the region is a code a reader will recognise without its country. */
export function isKnownRegion(region: string): boolean {
  const trimmed = region.trim();
  if (!trimmed) return false;
  const codes = new Set(Object.values(REGIONS));
  return codes.has(trimmed.toUpperCase()) || trimmed.toLowerCase() in REGIONS;
}

/**
 * A phone number as a person reads it.
 *
 * "9059225891" is what a form collects and not what belongs on a resume. Only
 * North American 10-digit numbers are reformatted — anything else is left
 * exactly as typed, because guessing at an unfamiliar national format produces
 * something worse than the original.
 */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (local.length !== 10) return phone.trim();
  // Only reformat when there was nothing to preserve — someone who typed
  // "+44 20 7946 0958" or "(905) 922-5891" meant it.
  if (/[^\d\s]/.test(phone.trim())) return phone.trim();
  return `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}`;
}

/** A website as a resume shows it: the domain, not the protocol. */
export function formatWebsite(url: string): string {
  return url.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
}
