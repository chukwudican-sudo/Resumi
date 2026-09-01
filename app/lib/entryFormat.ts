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
  const parts = [place.city, place.region].map((p) => p?.trim()).filter(Boolean);
  const country = place.country?.trim();

  if (parts.length === 0 && !country) return fallback?.trim() ?? '';

  const sameCountry =
    country && homeCountry && country.toLowerCase() === homeCountry.trim().toLowerCase();
  if (country && !sameCountry) parts.push(country);

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
