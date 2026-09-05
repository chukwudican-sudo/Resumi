import { applyPolish, polishResume, validateCorrections, type PolishResult } from '../lib/polish';
import { proofread } from '../lib/proofread';
import { buildResume, entryFromRow } from '../lib/buildResume';
import { profileStrength } from '../lib/profileStrength';
import type { ResumeStructure } from '../lib/types';
import {
  applyCorrectionsToEntries,
  applyCorrectionsToSkillFacts,
  normaliseEmploymentTitles,
  getProfile,
  getResumeInputs,
  getUser,
  saveMasterResume,
} from './db/repository';

/**
 * Runs the pass and keeps what it decided.
 *
 * The order matters. Corrections go to the entries first, then the resume is
 * rebuilt from those corrected entries, and only then are the presentation
 * decisions laid on top — so the spelling fix lives in the data where it
 * survives every future edit, and the grouping lives on the derived resume
 * where it belongs.
 */
export async function runPolish(
  userId: string,
  structure: ResumeStructure,
  locale: string | null,
): Promise<PolishResult> {
  // Two calls, at the same time. They were one, and proofreading was the job
  // that got dropped: asked to also group skills, order sections and write
  // warnings, the model returned no corrections at all on a resume containing
  // "Dean Listst" and "Ms Powerpoinnt". Given only the spelling to do, it found
  // both, every time. Running them in parallel costs no extra wait.
  const [{ polish }, rawCorrections] = await Promise.all([
    polishResume(userId, structure, locale),
    proofread(userId, structure, structure.name).catch((error) => {
      // A resume with an uncorrected typo is worse than one without; a resume
      // nobody can download is worse than both.
      console.error('[Resumi] Proofreading failed; continuing without it.', error);
      return [];
    }),
  ]);

  polish.corrections = validateCorrections(rawCorrections);

  await Promise.all([
    applyCorrectionsToEntries(userId, polish.corrections),
    applyCorrectionsToSkillFacts(userId, polish.corrections),
    normaliseEmploymentTitles(userId),
  ]);

  const { entryRows, factRows } = await getResumeInputs(userId);
  const corrected = buildResume(entryRows.map(entryFromRow), factRows);
  const applied = applyPolish(corrected, polish);

  await saveMasterResume(userId, applied, profileStrength(applied), false);
  return polish;
}

/**
 * Polishes the master resume, if it needs it.
 *
 * The pass used to be a button, which meant almost nobody would ever run it.
 * Someone signs up, fills the form, presses Download, and receives a resume
 * whose skills are still the sentences they typed and whose sections are in
 * whatever order the renderer defaults to. That was the *ordinary* outcome, not
 * an edge case — the good version was hidden behind a control nothing pointed
 * at.
 *
 * Returns null when nothing needed doing, so callers can tell the difference
 * between "already current" and "just changed under you" and say so.
 *
 * A failure here is deliberately not fatal. Polishing improves a resume; not
 * polishing is a worse resume, not a broken one, and refusing to hand over
 * someone's own document because an optional model call failed would be the
 * wrong trade every time.
 */
export async function polishIfStale(userId: string): Promise<PolishResult | null> {
  const [profile, user] = await Promise.all([getProfile(userId), getUser(userId)]);
  if (!profile?.stale) return null;

  const structure = profile.resumeStructure as ResumeStructure | null;
  if (!structure?.name) return null;

  try {
    return await runPolish(userId, structure, user?.locale ?? null);
  } catch (error) {
    console.error('[Resumi] Automatic polish failed; continuing unpolished.', error);
    return null;
  }
}
