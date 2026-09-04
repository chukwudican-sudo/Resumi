import { formatDates, formatPhone, formatPlace, formatWebsite, recencyKey } from './entryFormat';
import { titleWithEmployment } from './employment';
import type { ProfileEntry, ResumeStructure } from './types';

/**
 * Turns what someone typed into their master resume.
 *
 * Deliberately deterministic — no model, no waiting, no cost. What you enter in
 * the form is what appears, immediately and exactly. That matters for trust as
 * much as for speed: a resume that quietly rewords your own sentences before
 * you have asked it to is unsettling, and it makes it impossible to tell what
 * the tailoring later actually changed.
 *
 * The AI has exactly one job in this product, and it is not this one. It runs
 * when you tailor to a specific posting, against a master resume you can see.
 */

export interface EntryWithBullets extends ProfileEntry {
  bullets: string[];
  tech?: string | null;
  url?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  startMonth?: number | null;
  startYear?: number | null;
  endMonth?: number | null;
  endYear?: number | null;
  isCurrent?: boolean;
  extra?: Record<string, string> | null;
}

/**
 * A `profile_entries` row as the resume wants it.
 *
 * Lives here rather than at each call site because it was duplicated in two
 * places and both silently dropped the structured date and place columns when
 * they were added — dates saved fine and then disappeared on the next read.
 * One conversion means a new column can only be forgotten once.
 */
export function entryFromRow(row: {
  id: string;
  kind: string;
  title: string | null;
  org: string | null;
  location: string | null;
  datesDisplay: string | null;
  orderIndex: number;
  source: string;
  bullets: unknown;
  tech: string | null;
  url: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  startMonth: number | null;
  startYear: number | null;
  endMonth: number | null;
  endYear: number | null;
  isCurrent: boolean | null;
  extra: unknown;
}): EntryWithBullets {
  return {
    id: row.id,
    kind: row.kind as EntryWithBullets['kind'],
    title: row.title ?? undefined,
    org: row.org ?? undefined,
    location: row.location ?? undefined,
    datesDisplay: row.datesDisplay ?? undefined,
    orderIndex: row.orderIndex,
    source: row.source as EntryWithBullets['source'],
    bullets: (row.bullets as string[]) ?? [],
    tech: row.tech,
    url: row.url,
    city: row.city,
    region: row.region,
    country: row.country,
    startMonth: row.startMonth,
    startYear: row.startYear,
    endMonth: row.endMonth,
    endYear: row.endYear,
    isCurrent: row.isCurrent ?? false,
    extra: (row.extra as Record<string, string> | null) ?? null,
  };
}

function datesOf(e: EntryWithBullets) {
  return {
    startMonth: e.startMonth ?? null,
    startYear: e.startYear ?? null,
    endMonth: e.endMonth ?? null,
    endYear: e.endYear ?? null,
    isCurrent: e.isCurrent ?? false,
  };
}

function placeOf(e: EntryWithBullets) {
  return { city: e.city ?? null, region: e.region ?? null, country: e.country ?? null };
}

/** Contact details are stored as `Label: value` identity facts. */
export interface ContactFact {
  category: string;
  text: string;
}

function readContact(facts: ContactFact[]) {
  const pick = (label: string) => {
    const hit = facts.find(
      (f) => f.category === 'identity' && f.text.toLowerCase().startsWith(`${label.toLowerCase()}: `),
    );
    return hit ? hit.text.slice(label.length + 2).trim() : '';
  };
  return {
    name: pick('Name'),
    email: pick('Email'),
    phone: pick('Phone'),
    location: pick('Location'),
    linkedin: pick('LinkedIn'),
    github: pick('GitHub'),
    website: pick('Website'),
  };
}

/** Skills are stored as `Category: items` skill facts, or bare items. */
function readSkills(facts: ContactFact[]): { category: string; items: string }[] {
  const groups = new Map<string, string[]>();
  for (const f of facts) {
    if (f.category !== 'skill') continue;
    const colon = f.text.indexOf(':');
    const category = colon > 0 ? f.text.slice(0, colon).trim() : 'Skills';
    const items = colon > 0 ? f.text.slice(colon + 1).trim() : f.text.trim();
    if (!items) continue;
    const list = groups.get(category);
    if (list) list.push(items);
    else groups.set(category, [items]);
  }
  return Array.from(groups, ([category, items]) => ({ category, items: items.join(', ') }));
}

export function buildResume(entries: EntryWithBullets[], facts: ContactFact[]): ResumeStructure {
  const contact = readContact(facts);
  // Most recent first, by the dates people actually gave — falling back to the
  // order they were added when an entry has none, so an undated entry does not
  // silently jump to the top of a resume.
  const byKind = (kind: string) =>
    entries
      .filter((e) => e.kind === kind)
      .sort((a, b) => {
        const diff = recencyKey(datesOf(b)) - recencyKey(datesOf(a));
        return diff !== 0 ? diff : a.orderIndex - b.orderIndex;
      });

  const home = readContact(facts).location.split(',').pop()?.trim() || null;

  // Trailing whitespace survives a form field and then shows up as a gap before
  // a separator on the page.
  const clean = (value: string | null | undefined) => (value ?? '').trim();

  return {
    name: contact.name,
    contact: {
      email: contact.email || undefined,
      phone: contact.phone ? formatPhone(contact.phone) : undefined,
      linkedin: contact.linkedin ? formatWebsite(contact.linkedin) : undefined,
      github: contact.github ? formatWebsite(contact.github) : undefined,
      website: contact.website ? formatWebsite(contact.website) : undefined,
    },
    education: byKind('education').map((e) => ({
      school: clean(e.org),
      location: formatPlace(placeOf(e), e.location, home),
      // "Bachelor of Engineering in Software Engineering" — the credential and
      // the field read as one phrase, and a field of study on its own leaves a
      // reader guessing at the level.
      degree: [
        [clean(e.extra?.credential), clean(e.title)].filter(Boolean).join(' in '),
        clean(e.extra?.honours),
      ]
        .filter(Boolean)
        .join(' · '),
      dates: formatDates(datesOf(e), 'education', e.datesDisplay),
      // Coursework, honours, a thesis. For a student this is often the most
      // relevant thing on the page, and it had nowhere to go.
      bullets: e.bullets ?? [],
    })),
    experience: byKind('experience').map((e) => ({
      // "(Part-time)" earns its place by being rare — it explains why two roles
      // overlap, or why a stint was short. "(Full-time)" on every entry is what
      // a reader already assumed and makes the page look generated.
      title: titleWithEmployment(clean(e.title), e.extra?.employment),
      org: clean(e.org),
      location: formatPlace(placeOf(e), e.location, home),
      dates: formatDates(datesOf(e), 'experience', e.datesDisplay),
      bullets: e.bullets ?? [],
    })),
    projects: byKind('project').map((e) => ({
      name: clean(e.title),
      tech: clean(e.tech),
      // Kept separate from tech. Concatenating them put a 50-character URL in
      // a heading cell that does not wrap, which pushed the dates past the
      // right margin and clipped them off the page.
      url: clean(e.url) || undefined,
      dates: formatDates(datesOf(e), 'project', e.datesDisplay),
      bullets: e.bullets ?? [],
    })),
    skills: readSkills(facts),
  };
}

/**
 * Which sections still need something, for the setup rail.
 *
 * Ordered as the form is, and expressed as what is missing rather than as a
 * percentage — "add your first job" is actionable in a way that "7% complete"
 * is not, and a low percentage on the opening screen mostly communicates how
 * far you are from finishing.
 */
export interface SectionStatus {
  key: 'contact' | 'experience' | 'education' | 'projects' | 'skills';
  label: string;
  done: boolean;
  detail: string;
}

export function sectionStatus(entries: EntryWithBullets[], facts: ContactFact[]): SectionStatus[] {
  const contact = readContact(facts);
  const count = (kind: string) => entries.filter((e) => e.kind === kind).length;
  const skills = readSkills(facts).length;

  return [
    {
      key: 'contact',
      label: 'Contact',
      done: Boolean(contact.name && contact.email),
      detail: contact.name && contact.email ? 'Name and email set' : 'Name and email needed',
    },
    {
      key: 'experience',
      label: 'Experience',
      done: count('experience') > 0,
      detail: count('experience') ? `${count('experience')} added` : 'None yet',
    },
    {
      key: 'education',
      label: 'Education',
      done: count('education') > 0,
      detail: count('education') ? `${count('education')} added` : 'None yet',
    },
    {
      key: 'projects',
      label: 'Projects',
      done: count('project') > 0,
      detail: count('project') ? `${count('project')} added` : 'Optional',
    },
    {
      key: 'skills',
      label: 'Skills',
      done: skills > 0,
      detail: skills ? `${skills} ${skills === 1 ? 'group' : 'groups'}` : 'None yet',
    },
  ];
}

/** Enough to tailor from: someone reachable, with at least one thing they have done. */
export function isResumeUsable(entries: EntryWithBullets[], facts: ContactFact[]): boolean {
  const contact = readContact(facts);
  const hasSomething = entries.some((e) => e.kind === 'experience' || e.kind === 'project');
  return Boolean(contact.name && contact.email && hasSomething);
}
