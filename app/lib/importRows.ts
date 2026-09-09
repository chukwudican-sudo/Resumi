import type { ResumeSection, ResumeStructure } from './types';
import { CONVENTIONAL_ORDER, KNOWN_SHAPES, entryKindFor, inferShape, keyFor } from './sections';
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
  /** 'experience' | 'education' | 'project', or a custom section's own key. */
  kind: string;
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

/** One section off an uploaded resume, as the extraction tool returns it. */
export interface ExtractedSection {
  label: string;
  entries?: {
    title?: string;
    org?: string;
    location?: string;
    dates?: string;
    tech?: string;
    url?: string;
    bullets?: string[];
  }[];
  lines?: string[];
  text?: string;
}

const clean = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const cleanBullets = (bullets: string[] | undefined): string[] =>
  (bullets ?? []).map((b) => b.trim()).filter(Boolean);

/**
 * Every entry in the file, in the order it appeared.
 *
 * @param sections The plan from sectionsFromStructure. Entry-shaped sections
 * the app has no name for — Volunteering, Extracurriculars — store their rows
 * here like anybody else, filed under the section's own key. Before this they
 * were not stored anywhere: the extractor was told to omit them, and the two
 * that reached a real database on 2026-09-08 left no trace at all.
 */
export function entriesFromStructure(
  structure: ResumeStructure,
  sections: ResumeSection[] = [],
): ImportedEntry[] {
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

  for (const section of sections) {
    // The four the app has named fields for are already above; anything else
    // that holds entries stores them under its own key.
    if (KNOWN_SHAPES[section.key]) continue;
    if (section.shape !== 'entries' && section.shape !== 'inline') continue;

    (section.entries ?? []).forEach((e, i) => {
      rows.push({
        kind: entryKindFor(section.key),
        title: clean(e.title),
        org: clean(e.org),
        location: clean(e.location),
        ...structuredPlace(e.location),
        tech: clean(e.tech),
        url: clean(e.url),
        datesDisplay: clean(e.dates),
        // The experience rule: a volunteering stint reads like a job, not like
        // a degree with an expected completion date.
        ...structuredDates(e.dates, 'experience'),
        extra: {},
        bullets: cleanBullets(e.bullets),
        orderIndex: i,
      });
    });
  }

  return rows;
}

/**
 * The sections this resume actually has, named and ordered as it had them.
 *
 * The arrangement is read off the headings the extractor listed, not imposed:
 * a resume that puts Projects above Experience keeps that, and a section the
 * app has never heard of keeps its own name. What used to happen instead was
 * that the extraction prompt said "content that does not fit the canonical set
 * is simply omitted", and it was.
 *
 * A heading with nothing under it is dropped rather than stored empty — an
 * empty section is a heading with no content, and an `itemize` with no `\item`
 * aborts the LaTeX compile outright.
 */
export function sectionsFromStructure(
  structure: ResumeStructure,
  extras: ExtractedSection[] = [],
  order: string[] = [],
): ResumeSection[] {
  const taken = new Set<string>();
  const byKey = new Map<string, ExtractedSection>();
  for (const extra of extras) {
    if (!extra?.label?.trim()) continue;
    const key = keyFor(extra.label, taken);
    // An extra whose heading names one of the seven belongs in the named field,
    // not beside it — otherwise "Work Experience" arrives twice, once as rows
    // and once as an inline copy that renders underneath.
    if (KNOWN_SHAPES[key]) continue;
    taken.add(key);
    byKey.set(key, extra);
  }

  const sections: ResumeSection[] = [];
  const placed = new Set<string>();

  for (const heading of order) {
    if (!heading?.trim()) continue;
    // No `taken` here: this is a LOOKUP, not an assignment. Passing the set in
    // made the heading slug to extracurricular_community_activities_2 — because
    // the extras loop had already claimed the real key — which matched nothing,
    // so the section fell out of the order and got appended at the end.
    const key = keyFor(heading);
    if (placed.has(key)) continue;

    if (KNOWN_SHAPES[key]) {
      if (!hasNamedContent(structure, key)) continue;
      placed.add(key);
      sections.push(knownSection(structure, key, heading.trim()));
      continue;
    }

    const extra = byKey.get(key);
    if (!extra) continue;
    const section = asSection(key, heading.trim(), extra);
    if (!section) continue;
    placed.add(key);
    sections.push(section);
  }

  // Anything the headings missed. The order list is the model's account of the
  // page and it can be short; a section that exists and is not on it should
  // still be kept, at its conventional place rather than nowhere.
  for (const conventional of CONVENTIONAL_ORDER) {
    if (placed.has(conventional.key)) continue;
    if (!hasNamedContent(structure, conventional.key)) continue;
    placed.add(conventional.key);
    sections.push(knownSection(structure, conventional.key, conventional.label));
  }
  for (const [key, extra] of byKey) {
    if (placed.has(key)) continue;
    const section = asSection(key, extra.label.trim(), extra);
    if (section) sections.push(section);
  }

  return sections;
}

/** One extracted section, with its shape read off its content. */
function asSection(key: string, label: string, extra: ExtractedSection): ResumeSection | null {
  const entries = (extra.entries ?? []).filter((e) => clean(e?.title) || cleanBullets(e?.bullets).length);
  const lines = (extra.lines ?? []).map((l) => l.trim()).filter(Boolean);
  const text = extra.text?.trim() ?? '';

  const shape = inferShape({ entries, lines, text });
  if (!shape) return null;

  switch (shape) {
    case 'entries':
    case 'inline':
      return {
        key,
        label,
        shape,
        entries: entries.map((e) => ({
          title: clean(e.title) ?? '',
          ...(clean(e.org) ? { org: clean(e.org)! } : {}),
          ...(clean(e.location) ? { location: clean(e.location)! } : {}),
          ...(clean(e.dates) ? { dates: clean(e.dates)! } : {}),
          ...(clean(e.url) ? { url: clean(e.url)! } : {}),
          bullets: cleanBullets(e.bullets),
        })),
      };
    case 'groups':
      return {
        key,
        label,
        shape,
        groups: lines.map((line) => {
          const colon = line.indexOf(':');
          return { category: line.slice(0, colon).trim(), items: line.slice(colon + 1).trim() };
        }),
      };
    case 'list':
      return { key, label, shape, items: lines };
    case 'prose':
      return { key, label, shape, text };
  }
}

/**
 * One of the seven, as a section.
 *
 * Education, experience, projects and skills carry no content here — theirs is
 * in rows and facts. The other three have nowhere else to live, so the section
 * IS where they live. That is the whole fix for the summary: it used to exist
 * only in the derived blob, and the first rebuild from rows deleted it.
 */
function knownSection(structure: ResumeStructure, key: string, label: string): ResumeSection {
  switch (key) {
    case 'summary':
      return { key, label, shape: 'prose', text: structure.summary?.trim() ?? '' };
    case 'certifications':
      return { key, label, shape: 'list', items: cleanBullets(structure.certifications) };
    case 'awards':
      return { key, label, shape: 'list', items: cleanBullets(structure.awards) };
    default:
      return { key, label };
  }
}

/** Whether one of the seven named fields actually holds anything. */
function hasNamedContent(structure: ResumeStructure, key: string): boolean {
  switch (key) {
    case 'summary':
      return Boolean(structure.summary?.trim());
    case 'education':
      return (structure.education ?? []).length > 0;
    case 'experience':
      return (structure.experience ?? []).length > 0;
    case 'projects':
      return (structure.projects ?? []).length > 0;
    case 'skills':
      return (structure.skills ?? []).some((s) => s?.items?.trim());
    case 'certifications':
      return (structure.certifications ?? []).some((c) => c?.trim());
    case 'awards':
      return (structure.awards ?? []).some((a) => a?.trim());
    default:
      return false;
  }
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
