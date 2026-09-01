import type { ResumeStructure } from './types';

/**
 * How much editing every future tailor will need, as one number out of 100.
 *
 * It is shown on the profile page because it is the one figure that predicts
 * whether generated resumes will land — and unlike a vague "completeness"
 * percentage, each thing it measures is something the person can go and fix.
 *
 * Quantified bullets dominate the score on purpose. A resume full of
 * responsibilities reads as a job description; the numbers are what make it
 * read as a record of what someone did.
 */

const WEIGHTS = {
  contact: 15,     // an unreachable resume is worthless, however good
  education: 10,
  experience: 20,  // having entries at all
  quantified: 35,  // bullets carrying a real number — the thing that matters most
  skills: 10,
  depth: 10,       // enough bullets per entry to say something
};

/** A digit that is not merely a year. Mirrors the interview's own rule. */
export function hasQuantity(text: string): boolean {
  if (/(\d+(\.\d+)?\s*%|[$£€]\s*\d|\d+(\.\d+)?\s*[xX]\b)/.test(text)) return true;
  const numbers = text.match(/\d+(\.\d+)?/g);
  if (!numbers) return false;
  return numbers.some((n) => !/^(19|20)\d{2}$/.test(n));
}

export function profileStrength(structure: ResumeStructure | null | undefined): number {
  if (!structure) return 0;

  const contact = structure.contact ?? {};
  const experience = structure.experience ?? [];
  const projects = structure.projects ?? [];
  const education = structure.education ?? [];
  const skills = structure.skills ?? [];
  const entries = [...experience, ...projects];

  let score = 0;

  // Contact: email is the one that actually matters, the rest are bonus.
  if (contact.email) score += WEIGHTS.contact * 0.7;
  if (contact.phone || contact.linkedin || contact.github || contact.website) {
    score += WEIGHTS.contact * 0.3;
  }

  if (education.length > 0) score += WEIGHTS.education;
  if (entries.length > 0) score += WEIGHTS.experience * Math.min(entries.length / 3, 1);
  if (skills.length > 0) score += WEIGHTS.skills * Math.min(skills.length / 3, 1);

  const bullets = entries.flatMap((e) => e.bullets ?? []);
  if (bullets.length > 0) {
    const quantified = bullets.filter(hasQuantity).length;
    score += WEIGHTS.quantified * (quantified / bullets.length);

    // Two or more bullets per entry is roughly where an entry stops being a
    // job title and starts being a description of work.
    const wellDescribed = entries.filter((e) => (e.bullets ?? []).length >= 2).length;
    score += WEIGHTS.depth * (entries.length ? wellDescribed / entries.length : 0);
  }

  return Math.round(Math.min(score, 100));
}

/** Entries whose bullets carry no number — what the profile page offers to fix. */
export function unquantifiedEntries(structure: ResumeStructure | null | undefined): string[] {
  if (!structure) return [];
  const weak: string[] = [];
  for (const job of structure.experience ?? []) {
    if ((job.bullets ?? []).length > 0 && !(job.bullets ?? []).some(hasQuantity)) {
      weak.push([job.title, job.org].filter(Boolean).join(' at '));
    }
  }
  for (const project of structure.projects ?? []) {
    if ((project.bullets ?? []).length > 0 && !(project.bullets ?? []).some(hasQuantity)) {
      weak.push(project.name);
    }
  }
  return weak;
}
