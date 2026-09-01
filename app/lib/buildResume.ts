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
  const byKind = (kind: string) =>
    entries.filter((e) => e.kind === kind).sort((a, b) => a.orderIndex - b.orderIndex);

  return {
    name: contact.name,
    contact: {
      email: contact.email || undefined,
      phone: contact.phone || undefined,
      linkedin: contact.linkedin || undefined,
      website: contact.website || undefined,
    },
    education: byKind('education').map((e) => ({
      school: e.org ?? '',
      location: e.location ?? '',
      degree: e.title ?? '',
      dates: e.datesDisplay ?? '',
    })),
    experience: byKind('experience').map((e) => ({
      title: e.title ?? '',
      org: e.org ?? '',
      location: e.location ?? '',
      dates: e.datesDisplay ?? '',
      bullets: e.bullets ?? [],
    })),
    projects: byKind('project').map((e) => ({
      name: e.title ?? '',
      tech: e.tech ?? '',
      dates: e.datesDisplay ?? '',
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
