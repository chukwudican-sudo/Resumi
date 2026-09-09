/**
 * A one-line award or certificate, split back into its parts.
 *
 * The extractor is told to send a structured section when each item carries an
 * issuer or a date, and it does not always: a real upload came back with
 * "Dean's Honour List — Ontario Tech University, 2025" as one string, three
 * times. Nothing was lost, but the year ended up buried mid-line while every
 * other section on the page right-aligns its dates.
 *
 * So the flat form is taken apart here rather than argued about in a prompt.
 * Deterministic, and deliberately reluctant: a line only splits when the pieces
 * are unmistakable, because a wrong split puts half of somebody's award title
 * where the issuer goes.
 */

export interface FlatEntry {
  title: string;
  org: string;
  dates: string;
}

/** "2025", "Jun 2025", "Jun 2025 – Jun 2028", "2025 – Present". */
const DATE = String.raw`(?:[A-Z][a-z]{2,8}\.?\s+)?\d{4}`;
const TRAILING_DATE = new RegExp(
  String.raw`^(.*?)[,\s]+(${DATE}(?:\s*[–—-]\s*(?:${DATE}|Present))?)\s*$`,
);

export function splitFlatEntry(line: string): FlatEntry | null {
  const text = (line ?? '').trim();
  if (!text) return null;

  // The date first, and only at the very end. "Top 50 Blogs of 2022 by Health
  // Magazine" has a year in the middle and is a sentence, not a dated entry.
  let rest = text;
  let dates = '';
  const dated = TRAILING_DATE.exec(text);
  if (dated) {
    rest = dated[1].trim().replace(/[,–—-]\s*$/, '').trim();
    dates = dated[2].trim();
  }

  // Then the issuer: a dash if there is one, otherwise the last comma. A dash
  // is the stronger signal, so it wins even when commas appear in the title.
  let title = rest;
  let org = '';
  const dash = /^(.*?)\s+[–—]\s+(.*)$/.exec(rest);
  if (dash) {
    title = dash[1].trim();
    org = dash[2].trim();
  } else {
    const comma = rest.lastIndexOf(', ');
    if (comma > 0) {
      title = rest.slice(0, comma).trim();
      org = rest.slice(comma + 2).trim();
    }
  }

  // Nothing gained means leave it alone. A bare award name is a list item, and
  // a sentence describing an achievement is emphatically not three fields.
  if (!title || (!org && !dates)) return null;
  return { title, org, dates };
}

/**
 * The whole section, or nothing.
 *
 * All or none, because a section half in one shape and half in the other reads
 * as a mistake on the page — and a list that mostly does not split is a list
 * somebody wrote as prose.
 */
export function splitFlatEntries(lines: string[]): FlatEntry[] | null {
  const written = lines.map((l) => (l ?? '').trim()).filter(Boolean);
  if (!written.length) return null;

  const split = written.map(splitFlatEntry);
  return split.every((e): e is FlatEntry => e !== null) ? split : null;
}
