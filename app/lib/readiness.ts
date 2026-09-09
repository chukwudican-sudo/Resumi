import type { ResumeStructure } from './types';
import { contentFor, planSections } from './sections';

/**
 * Whether this resume is fit to send.
 *
 * Two levels, because they fail differently. A **blocker** is something that
 * would reach a recruiter as visibly broken or missing — an entry with no
 * bullets prints a heading over blank space, an entry with no dates cannot be
 * placed in a career. Those should not be downloadable, because the person
 * cannot see the problem from inside the form and will find out after sending.
 *
 * A **warning** is something weaker than it could be. Those never block. A tool
 * that refuses to give you your own resume until it approves of it is worse
 * than one that hands it over and tells you what it would fix — people have
 * deadlines, and a thin resume sent today beats a perfect one sent never.
 */

export interface ReadinessIssue {
  /** Which part of the form fixes it, so the message can point somewhere. */
  section: 'contact' | 'experience' | 'education' | 'projects' | 'skills';
  message: string;
}

export interface Readiness {
  blocking: ReadinessIssue[];
  warnings: ReadinessIssue[];
  ready: boolean;
}

/** A skill entry that reads as a sentence rather than a term. */
function readsAsProse(items: string): boolean {
  return items
    .split(',')
    .some((item) => /\b(uses?|has|have|considers?|backed by|across|most)\b/i.test(item) || item.trim().split(/\s+/).length > 6);
}

export function checkReadiness(structure: ResumeStructure): Readiness {
  const blocking: ReadinessIssue[] = [];
  const warnings: ReadinessIssue[] = [];

  const block = (section: ReadinessIssue['section'], message: string) => blocking.push({ section, message });
  const warn = (section: ReadinessIssue['section'], message: string) => warnings.push({ section, message });

  // ── Contact ──
  if (!structure.name?.trim()) block('contact', 'Add your name — it is the first thing on the page.');
  if (!structure.contact.email?.trim()) block('contact', 'Add an email, or nobody can reply to you.');

  if (!structure.contact.phone?.trim()) {
    warn('contact', 'No phone number. Most applications ask for one anyway.');
  }
  const hasLink = Boolean(
    structure.contact.github?.trim() || structure.contact.website?.trim() || structure.contact.linkedin?.trim(),
  );
  if (!hasLink) {
    warn('contact', 'No link to your work. For a software role a recruiter expects a GitHub or a portfolio.');
  }

  // ── Anything to show ──
  //
  // Counted across every section that holds entries, not just the two the app
  // started with. A student with a degree, a volunteering post and two
  // certificates was told to "add a job or a project" — and this blocker also
  // hides the preview, so they got no resume on screen either, for a resume
  // that was perfectly real.
  const somethingDone = planSections(structure).some((section) => {
    if (section.key === 'education') return false;
    const content = contentFor(structure, section);
    return (
      (content.shape === 'entries' && content.entries.length > 0) ||
      (content.shape === 'inline' && content.entries.length > 0)
    );
  });
  if (!somethingDone) {
    block('experience', 'Add a job, a project, or something else you have done — a resume needs at least one.');
  }

  // ── Entries that would print broken ──
  for (const x of structure.experience) {
    const label = [x.title, x.org].filter(Boolean).join(' at ') || 'One of your jobs';
    if (!x.bullets.filter((b) => b.trim()).length) {
      block('experience', `${label} has no bullet points, so it would print as a heading over blank space.`);
    }
    if (!x.dates?.trim()) {
      block('experience', `${label} has no dates, so it cannot be placed in your history.`);
    }
  }

  for (const p of structure.projects) {
    const label = p.name || 'One of your projects';
    if (!p.bullets.filter((b) => b.trim()).length) {
      block('projects', `${label} has no bullet points, so it would print as a heading over blank space.`);
    }
    if (!p.dates?.trim()) block('projects', `${label} has no dates.`);
  }

  for (const e of structure.education) {
    const label = e.school || 'Your education entry';
    if (!e.dates?.trim()) block('education', `${label} has no dates.`);
    if (!e.degree?.trim()) {
      block('education', `${label} has no degree on it — add the credential and what you studied.`);
    } else if (!/\b(bachelor|master|diploma|certificate|phd|doctor|associate)\b/i.test(e.degree)) {
      warn('education', `${label} does not say what kind of degree it is. "Bachelor of Engineering in ${e.degree}" reads better than "${e.degree}".`);
    }
    if (!e.bullets?.filter((b) => b.trim()).length) {
      warn('education', 'No coursework listed. While you are still studying it is often the most relevant thing you have.');
    }
  }

  // ── Skills ──
  const skills = structure.skills.filter((s) => s.items.trim());
  if (skills.length === 0) {
    block('skills', 'Add your skills — this is the section most automated screens read first.');
  } else if (skills.some((s) => readsAsProse(s.items))) {
    // The polish pass turns these into terms, so this is really "polish has not
    // run yet" wearing a more useful message.
    warn('skills', 'Your skills read as sentences rather than terms. Polishing will group them properly.');
  }

  return { blocking, warnings, ready: blocking.length === 0 };
}
