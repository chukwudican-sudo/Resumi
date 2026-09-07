import type { ResumeStructure } from './types';
import { structuredDates, structuredPlace } from './entryFormat';
import { splitDegree } from './degree';

/**
 * An uploaded resume, turned into the rows the app actually reads.
 *
 * Pure and separate from the repository so it can be tested without a database,
 * because the bug this replaces was silent: the import wrote a title, an
 * organisation and a date string per entry and dropped the bullets, the skills
 * and the contact details. /setup renders from rows, so a new user who uploaded
 * their resume got job headings with nothing underneath, an empty Contact and
 * an empty Skills — and the preview still looked right, because that rendered
 * from the stored structure instead. The first save rebuilt from these rows and
 * the bullets were gone.
 *
 * The same class of mistake as entryFromRow dropping new columns, which is why
 * there is a test asserting nothing is left behind.
 */

export interface ImportedEntry {
  kind: 'experience' | 'education' | 'project';
  title: string | null;
  org: string | null;
  /** What the file said, kept whatever the parsing below managed. */
  location: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  tech: string | null;
  url: string | null;
  /** Likewise. The resume falls back to this when the parts are empty. */
  datesDisplay: string | null;
  startMonth: number | null;
  startYear: number | null;
  endMonth: number | null;
  endYear: number | null;
  isCurrent: boolean;
  extra: Record<string, string>;
  bullets: string[];
  orderIndex: number;
}

export interface ImportedFact {
  category: 'skill' | 'identity';
  text: string;
}

const clean = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const cleanBullets = (bullets: string[] | undefined): string[] =>
  (bullets ?? []).map((b) => b.trim()).filter(Boolean);

/** Every entry in the file, in the order it appeared. */
export function entriesFromStructure(structure: ResumeStructure): ImportedEntry[] {
  const rows: ImportedEntry[] = [];

  (structure.experience ?? []).forEach((e, i) => {
    rows.push({
      kind: 'experience',
      title: clean(e.title),
      org: clean(e.org),
      location: clean(e.location),
      ...structuredPlace(e.location),
      tech: null,
      url: null,
      datesDisplay: clean(e.dates),
      ...structuredDates(e.dates, 'experience'),
      extra: {},
      bullets: cleanBullets(e.bullets),
      orderIndex: i,
    });
  });

  (structure.projects ?? []).forEach((p, i) => {
    rows.push({
      kind: 'project',
      title: clean(p.name),
      org: null,
      location: null,
      city: null,
      region: null,
      country: null,
      // Its own column. Written into org, the stack printed where the employer
      // goes and the project's real field stayed empty.
      tech: clean(p.tech),
      url: clean(p.url),
      datesDisplay: clean(p.dates),
      ...structuredDates(p.dates, 'project'),
      extra: {},
      bullets: cleanBullets(p.bullets),
      orderIndex: i,
    });
  });

  (structure.education ?? []).forEach((e, i) => {
    // "Bachelor of Engineering in Software Engineering · Dean's List" is one
    // phrase on a page and three separate boxes in the editor.
    const degree = splitDegree(e.degree);
    rows.push({
      kind: 'education',
      title: clean(degree.title),
      org: clean(e.school),
      location: clean(e.location),
      ...structuredPlace(e.location),
      tech: null,
      url: null,
      datesDisplay: clean(e.dates),
      ...structuredDates(e.dates, 'education'),
      extra: {
        ...(degree.credential ? { credential: degree.credential } : {}),
        ...(degree.honours ? { honours: degree.honours } : {}),
      },
      // Coursework and honours. Often the most relevant thing a student has.
      bullets: cleanBullets(e.bullets),
      orderIndex: i,
    });
  });

  return rows;
}

/**
 * Skills and contact details, which are facts rather than entries.
 *
 * Labelled the same way saveContactDetails writes them — "Label: value" under
 * the identity category — because /setup reads them back by that prefix. A
 * different shape here would import cleanly and then show an empty form.
 */
export function factsFromStructure(structure: ResumeStructure): ImportedFact[] {
  const contact = structure.contact ?? {};

  const skills: ImportedFact[] = (structure.skills ?? [])
    .filter((g) => g.items?.trim())
    .map((g) => ({
      category: 'skill',
      text: g.category?.trim() ? `${g.category.trim()}: ${g.items.trim()}` : g.items.trim(),
    }));

  const identity: ImportedFact[] = (
    [
      ['Name', structure.name],
      ['Email', contact.email],
      ['Phone', contact.phone],
      ['LinkedIn', contact.linkedin],
      ['GitHub', contact.github],
      ['Website', contact.website],
    ] as const
  )
    .filter(([, value]) => value?.trim())
    .map(([label, value]) => ({ category: 'identity' as const, text: `${label}: ${value!.trim()}` }));

  return [...skills, ...identity];
}
