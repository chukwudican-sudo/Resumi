import { applyPolish, correctText, polishResume, validateCorrections, type PolishResult } from '../lib/polish';
import { proofread } from '../lib/proofread';
import { buildResume, entryFromRow } from '../lib/buildResume';
import { profileStrength } from '../lib/profileStrength';
import type { ResumeStructure } from '../lib/types';
import {
  applyCorrectionsToEntries,
  applyCorrectionsToSections,
  applyCorrectionsToSkillFacts,
  normaliseEmploymentTitles,
  saveSkillGroups,
  getProfile,
  getResumeInputs,
  getUser,
  ensureSections,
  saveMasterResume,
  saveSections,
} from './db/repository';

/**
 * Runs the pass and keeps what it decided.
 *
 * The order matters. Corrections go to the entries first, then the resume is
 * rebuilt from those corrected entries, and only then are the presentation
 * decisions laid on top — so the spelling fix lives in the data where it
 * survives every future edit.
 *
 * The skill grouping used to be treated as presentation and left on the derived
 * resume. It is not presentation, it is data: the editor reads facts, so the
 * resume showed Languages / Tools / Concepts while the form still showed one
 * lump called Skills. Worse, the next save marked the profile stale, the resume
 * fell back to the build from facts, and the grouping vanished from the
 * document too — so every polish re-derived the same answer and paid for the
 * call again.
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

  // The groups were decided from the profile as it was read, before the
  // spelling fixes existed, so they are corrected here or they carry the typo
  // straight back into the rows the corrections just cleaned.
  const groups = polish.skillGroups
    .map((g) => ({
      category: correctText(g.category, polish.corrections),
      items: g.items.map((item) => correctText(item, polish.corrections)).join(', '),
    }))
    .filter((g) => g.items.trim());

  await Promise.all([
    applyCorrectionsToEntries(userId, polish.corrections),
    // Everything the proofreader can now read, it can now also fix. Entries are
    // rows; a summary, a certifications list and a language's level are not.
    applyCorrectionsToSections(userId, polish.corrections),
    // Writing the groups replaces every skill fact, so correcting them in place
    // first would be work immediately thrown away — and both touch the same
    // rows, which is a race rather than a saving. Only when the pass returned
    // no usable grouping does the correction path still apply.
    groups.length
      ? saveSkillGroups(userId, groups)
      : applyCorrectionsToSkillFacts(userId, polish.corrections),
    normaliseEmploymentTitles(userId),
  ]);

  const { entryRows, factRows, sections } = await getResumeInputs(userId);
  const plan = sections.length ? sections : await ensureSections(userId);
  const corrected = buildResume(entryRows.map(entryFromRow), factRows, plan);
  const applied = applyPolish(corrected, polish);

  // The order goes to rows, not only to the derived resume.
  //
  // This is the bug, in one line. Polish decided the section order, wrote it
  // into profiles.resume_structure, and the next saveEntry rebuilt that blob
  // from rows and threw the decision away — which is why the pass kept
  // re-deciding the same thing and paying for the call again, and why
  // tailorGuard had to re-attach section names by hand. A summary had it worse:
  // it lived only in the blob, so a rebuild did not just forget where it went,
  // it deleted the paragraph.
  await saveSections(userId, applied.sections ?? []);
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
