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
    // "Expected 2028" reads better than "2024 – Expected" for a degree with no
    // meaningful start date on the page.
    if (kind === 'education' && parts.endYear) return `Expected ${point(parts.endMonth, parts.endYear)}`;
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
