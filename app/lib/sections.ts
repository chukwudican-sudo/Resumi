import type { ResumeSection, ResumeStructure, SectionShape } from './types';

/**
 * Which sections a resume has, what they are called, and what order they print.
 *
 * This exists because the app used to answer all three questions with a
 * hardcoded list of four, and everything outside that list was deleted — in the
 * extraction prompt, in the polish validator, and by simply having no field to
 * store it in. Somebody's Summary survived an upload, showed up in the preview,
 * and vanished the first time they pressed Polish, because the structure that
 * came back had nowhere to put one.
 *
 * So sections are data now. Seven keys the app still knows by name (their
 * content lives in the named fields on ResumeStructure that every scorer and
 * guard already reads); anything else carries its content inline. Both kinds
 * come out of `planSections` as the same thing: a key, a label, and a shape.
 *
 * SHAPE, NOT MEANING. There are five ways to draw a section and the LaTeX
 * template already draws all five. A Volunteering section is not a new thing to
 * render — it is `entries`, the same drawer Experience uses. That is the whole
 * reason this is affordable, and it is why nothing here asks what a section
 * *means*.
 */

/** The four `\resumeSubheading` slots, as the template lays them out. */
export interface DrawnEntry {
  /** Bold, line one, left. */
  heading: string;
  /** Line one, right. */
  headingRight: string;
  /** Italic, line two, left. */
  sub: string;
  /** Line two, right. */
  subRight: string;
  bullets: string[];
}

/** A `\resumeProjectHeading` — one line, pieces separated by bars, dates right. */
export interface DrawnInline {
  name: string;
  tech: string;
  url: string;
  dates: string;
  bullets: string[];
}

export type SectionContent =
  | { shape: 'entries'; entries: DrawnEntry[] }
  | { shape: 'inline'; entries: DrawnInline[] }
  | { shape: 'groups'; groups: { category: string; items: string }[] }
  | { shape: 'list'; items: string[] }
  | { shape: 'prose'; text: string };

/** A section resolved: what to call it, how to draw it, whether to expect it. */
export interface PlannedSection {
  key: string;
  label: string;
  shape: SectionShape;
  /**
   * True for the three the app has always treated as extras.
   *
   * The rail shows a core section even when it is empty — "Experience: none
   * yet" is the prompt to add one. Showing "Summary: none yet" to everybody
   * would put three new rows on a screen nobody asked to change.
   */
  optional: boolean;
}

/** The seven keys whose content lives in a named field rather than inline. */
export const KNOWN_SHAPES: Record<string, SectionShape> = {
  summary: 'prose',
  education: 'entries',
  experience: 'entries',
  projects: 'inline',
  skills: 'groups',
  certifications: 'list',
  awards: 'list',
};

/**
 * Where a section goes when nobody has said otherwise.
 *
 * This is not a new default — it is exactly what the renderer did when it had
 * summary hardcoded above the loop and certifications and awards hardcoded
 * below it. Written down so it can be departed from.
 */
export const CONVENTIONAL_ORDER: PlannedSection[] = [
  { key: 'summary', label: 'Summary', shape: 'prose', optional: true },
  { key: 'education', label: 'Education', shape: 'entries', optional: false },
  { key: 'experience', label: 'Experience', shape: 'entries', optional: false },
  { key: 'projects', label: 'Projects', shape: 'inline', optional: false },
  { key: 'skills', label: 'Technical Skills', shape: 'groups', optional: false },
  { key: 'certifications', label: 'Certifications', shape: 'list', optional: true },
  { key: 'awards', label: 'Awards', shape: 'list', optional: true },
];

const RANK = new Map(CONVENTIONAL_ORDER.map((s, i) => [s.key, i]));

const SHAPES: SectionShape[] = ['entries', 'inline', 'groups', 'list', 'prose'];

const clean = (value: string | null | undefined): string => (value ?? '').trim();

/**
 * The whole plan, in print order, empty sections included.
 *
 * Empties are kept deliberately: the rail renders from this and needs to offer
 * the sections somebody has not filled in yet. The renderer drops them, which
 * is what it has always done.
 *
 * A stored plan does not have to be complete. Polish returns four sections and
 * has never mentioned the summary, so a key it left out is spliced back in at
 * its conventional position rather than falling off the end — which is how a
 * profile polished before any of this existed still renders in the right order.
 */
export function planSections(structure: ResumeStructure): PlannedSection[] {
  const given = (structure.sections ?? [])
    .filter((s): s is ResumeSection => Boolean(s && typeof s.key === 'string' && s.key.trim()))
    .map(resolve)
    .filter((s): s is PlannedSection => s !== null);

  // Every key appears once. A model that returns Experience twice would
  // otherwise print the same jobs twice.
  const seen = new Set<string>();
  const plan = given.filter((s) => !seen.has(s.key) && seen.add(s.key));

  const queue = CONVENTIONAL_ORDER.filter((c) => !seen.has(c.key));
  const out: PlannedSection[] = [];
  let lastRank = -1;

  for (const section of plan) {
    // A custom section has no conventional rank, so it inherits the last one
    // seen — which is to say it stays exactly where it was put.
    const rank = RANK.get(section.key);
    const effective = rank ?? lastRank;
    while (queue.length && (RANK.get(queue[0].key) ?? 0) < effective) out.push(queue.shift()!);
    out.push(section);
    if (rank !== undefined) lastRank = rank;
  }

  return [...out, ...queue];
}

/** One stored section, resolved against what the app knows. */
function resolve(section: ResumeSection): PlannedSection | null {
  const key = section.key.trim();
  const known = KNOWN_SHAPES[key];
  const conventional = CONVENTIONAL_ORDER.find((c) => c.key === key);

  // A known key keeps its shape whatever the row claims. Nothing should be able
  // to make Education render as a paragraph.
  const shape = known ?? (SHAPES.includes(section.shape!) ? section.shape! : inferShape(section));
  if (!shape) return null;

  return {
    key,
    label: clean(section.label) || conventional?.label || titleCase(key),
    shape,
    optional: conventional ? conventional.optional : true,
  };
}

/**
 * What shape a section is, read off its content rather than asked for.
 *
 * A model told to report its own structure does not reliably do it — this
 * codebase has a guard file and a change log full of that lesson. But content
 * cannot lie about its own arrangement: rows with an organisation under the
 * title are laid out like jobs; lines that all read "Label: a, b, c" are
 * grouped skills; a paragraph is a paragraph.
 */
export function inferShape(section: {
  entries?: unknown[];
  groups?: unknown[];
  items?: unknown[];
  lines?: string[];
  text?: string;
}): SectionShape | null {
  const entries = (section.entries ?? []) as { org?: string; sub?: string; tech?: string }[];
  if (entries.length) {
    // A second line under the title is what separates a job from a project.
    return entries.some((e) => clean(e.org) || clean(e.sub)) ? 'entries' : 'inline';
  }

  if ((section.groups ?? []).length) return 'groups';

  const lines = [...((section.lines as string[]) ?? []), ...((section.items as string[]) ?? [])]
    .map(clean)
    .filter(Boolean);
  if (lines.length) return readsAsGroups(lines) ? 'groups' : 'list';

  if (clean(section.text)) return 'prose';
  return null;
}

/**
 * Whether every line is "Label: items" — a skills block written out flat.
 *
 * A single labelled line is more likely an award ("Dean's List: Fall 2024")
 * than a group of one, so one line only counts when it actually lists things.
 */
function readsAsGroups(lines: string[]): boolean {
  const parsed = lines.map((line) => /^([^:]{1,40}):\s*(\S.*)$/.exec(line));
  if (parsed.some((m) => m === null)) return false;
  return lines.length > 1 || parsed[0]![2].includes(',');
}

/**
 * The content of one planned section, in the form its drawer wants.
 *
 * Known keys read the named fields — the ones every scorer, guard and importer
 * already reads — so widening the plan did not move anybody's experience out
 * from under them. Custom keys read the inline content, because there is
 * nowhere else for it to be.
 */
export function contentFor(structure: ResumeStructure, section: PlannedSection): SectionContent {
  const inline = (structure.sections ?? []).find((s) => s?.key === section.key);

  switch (section.key) {
    case 'summary':
      return { shape: 'prose', text: clean(structure.summary) };

    case 'education':
      // Education fills the four slots differently from experience: the school
      // is bold with the location beside it, the degree italic with the dates.
      // That is how this template has always drawn it and it is not a bug.
      return {
        shape: 'entries',
        entries: (structure.education ?? []).map((e) => ({
          heading: clean(e.school),
          headingRight: clean(e.location),
          sub: clean(e.degree),
          subRight: clean(e.dates),
          bullets: written(e.bullets),
        })),
      };

    case 'experience':
      return {
        shape: 'entries',
        entries: (structure.experience ?? []).map((x) => ({
          heading: clean(x.title),
          headingRight: clean(x.dates),
          sub: clean(x.org),
          subRight: clean(x.location),
          bullets: written(x.bullets),
        })),
      };

    case 'projects':
      return {
        shape: 'inline',
        entries: (structure.projects ?? []).map((p) => ({
          name: clean(p.name),
          tech: clean(p.tech),
          url: clean(p.url),
          dates: clean(p.dates),
          bullets: written(p.bullets),
        })),
      };

    case 'skills':
      return {
        shape: 'groups',
        groups: (structure.skills ?? [])
          .filter((s) => clean(s?.items))
          .map((s) => ({ category: clean(s.category), items: clean(s.items) })),
      };

    case 'certifications':
      return { shape: 'list', items: written(structure.certifications) };

    case 'awards':
      return { shape: 'list', items: written(structure.awards) };

    default:
      return fromInline(section.shape, inline);
  }
}

/** A custom section's own content, carried on the plan entry itself. */
function fromInline(shape: SectionShape, section: ResumeSection | undefined): SectionContent {
  switch (shape) {
    case 'entries':
      return {
        shape: 'entries',
        entries: (section?.entries ?? []).map((e) => ({
          // The experience convention — role and dates on top, organisation and
          // place underneath. Volunteering, leadership and activities all read
          // that way, which is what makes one drawer enough.
          heading: clean(e.title),
          headingRight: clean(e.dates),
          sub: clean(e.org),
          subRight: clean(e.location),
          bullets: written(e.bullets),
        })),
      };
    case 'inline':
      return {
        shape: 'inline',
        entries: (section?.entries ?? []).map((e) => ({
          name: clean(e.title),
          tech: clean(e.tech),
          url: clean(e.url),
          dates: clean(e.dates),
          bullets: written(e.bullets),
        })),
      };
    case 'groups':
      return {
        shape: 'groups',
        groups: (section?.groups ?? [])
          .filter((g) => clean(g?.items))
          .map((g) => ({ category: clean(g.category), items: clean(g.items) })),
      };
    case 'list':
      return { shape: 'list', items: written(section?.items) };
    case 'prose':
      return { shape: 'prose', text: clean(section?.text) };
  }
}

/** Whether a section has anything to show. */
export function hasContent(content: SectionContent): boolean {
  switch (content.shape) {
    case 'entries':
      return content.entries.some((e) => e.heading || e.sub || e.bullets.length);
    case 'inline':
      return content.entries.some((e) => e.name || e.bullets.length);
    case 'groups':
      return content.groups.length > 0;
    case 'list':
      return content.items.length > 0;
    case 'prose':
      return content.text.length > 0;
  }
}

function written(values: string[] | undefined | null): string[] {
  return (values ?? []).map(clean).filter(Boolean);
}

/**
 * A stable key for a section named by whatever the resume called it.
 *
 * Keys are what `profile_entries.kind` holds, so they have to survive a round
 * trip and stay recognisable in a database. A label that names one of the seven
 * gets canonicalised — a resume saying "Work Experience" must not create a
 * second experience section beside the real one — and everything else is
 * slugged from what it was called.
 */
const SYNONYMS: Record<string, string> = {
  work_experience: 'experience',
  professional_experience: 'experience',
  employment: 'experience',
  employment_history: 'experience',
  work_history: 'experience',
  relevant_experience: 'experience',
  academic_background: 'education',
  technical_projects: 'projects',
  personal_projects: 'projects',
  selected_projects: 'projects',
  technical_skills: 'skills',
  core_competencies: 'skills',
  professional_summary: 'summary',
  objective: 'summary',
  profile: 'summary',
  about_me: 'summary',
  certificates: 'certifications',
  licenses: 'certifications',
  licences: 'certifications',
  honors: 'awards',
  honours: 'awards',
  achievements: 'awards',
};

/**
 * Keys a section may not claim.
 *
 * 'contact' is pinned at the top of the setup rail and is authored there rather
 * than printed as a section. A resume heading that slugged to it would put two
 * rail items under one key: React would warn about the duplicate, and the
 * section would be permanently unreachable because the pinned one matches
 * first. The extraction prompt says not to return a contact section; this makes
 * it not matter if it does.
 */
const RESERVED = new Set(['contact']);

export function keyFor(label: string, taken: Iterable<string> = []): string {
  const slug = clean(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
    .replace(/_+$/, '');

  const canonical = KNOWN_SHAPES[slug] ? slug : SYNONYMS[slug];
  if (canonical) return canonical;
  if (!slug) return 'section';

  // Two sections that slug the same would otherwise share a kind, and their
  // entries would pool into whichever one rendered first.
  const used = new Set([...taken, ...RESERVED]);
  if (!used.has(slug)) return slug;
  for (let n = 2; ; n += 1) {
    const candidate = `${slug}_${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * The `profile_entries.kind` an entry-shaped section stores its rows under.
 *
 * Only one section disagrees with its own key: the Projects section is
 * 'projects' and its rows have always been 'project'. Not worth a migration,
 * very much worth being written down in one place.
 */
export function entryKindFor(sectionKey: string): string {
  return sectionKey === 'projects' ? 'project' : sectionKey;
}

/**
 * A `profile_sections` row as the resume wants it.
 *
 * Lives beside the rest of this module rather than at the call site, for the
 * same reason `entryFromRow` does: the last two columns added to an entry were
 * both silently dropped by a hand-written conversion, and saved fine right up
 * until they were read back.
 *
 * Entry-shaped sections carry no content here — their entries are rows in
 * `profile_entries`, keyed by this section's key, and `buildResume` puts them
 * back. Only the shapes with nowhere else to live travel in `content`.
 */
export function sectionFromRow(row: {
  key: string;
  label: string;
  shape: string;
  content: unknown;
  orderIndex: number;
}): ResumeSection {
  const content = (row.content ?? {}) as Partial<ResumeSection>;
  const shape = SHAPES.includes(row.shape as SectionShape) ? (row.shape as SectionShape) : undefined;
  return {
    key: row.key,
    label: row.label,
    ...(shape ? { shape } : {}),
    ...(content.entries ? { entries: content.entries } : {}),
    ...(content.groups ? { groups: content.groups } : {}),
    ...(content.items ? { items: content.items } : {}),
    ...(content.text ? { text: content.text } : {}),
  };
}

/**
 * The keys whose content is held somewhere else entirely.
 *
 * Education, experience and projects are rows in `profile_entries`; skills are
 * facts. Their section row records order and label and nothing more — storing a
 * copy of the content beside the real one is how the two drift apart, which is
 * the failure this whole module exists to stop.
 */
export const STORED_ELSEWHERE = new Set(['education', 'experience', 'projects', 'skills']);

/** The other direction: what belongs in the row's `content` column. */
export function contentOf(section: ResumeSection): Record<string, unknown> {
  // Skills used to land here as `{"groups": []}` — an empty stub beside a
  // profile full of skills, reading as a claim that there were none.
  if (STORED_ELSEWHERE.has(section.key)) return {};

  switch (shapeOf(section)) {
    // Rows, not jsonb — see sectionFromRow.
    case 'entries':
    case 'inline':
      return {};
    case 'groups':
      return { groups: section.groups ?? [] };
    case 'list':
      return { items: section.items ?? [] };
    case 'prose':
      return { text: section.text ?? '' };
    default:
      return {};
  }
}

/**
 * What shape to store for a section, when it did not say.
 *
 * A known key knows its own shape and must be written down as that shape.
 * Defaulting to 'entries' put "this is a list of jobs" next to Projects and
 * Skills in the database — invisible, because the renderer looks the shape up
 * again for known keys rather than trusting the column, and wrong for anything
 * that reads the column and believes it.
 */
export function shapeOf(section: ResumeSection): SectionShape {
  return section.shape ?? KNOWN_SHAPES[section.key] ?? 'entries';
}

function titleCase(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
