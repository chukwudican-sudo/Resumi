import type { Step } from '../components/Stages';

/**
 * What each long operation actually does, in the order it does it.
 *
 * Written from the code rather than invented to fill time: `runPolish` really
 * does proofread, group skills and rebuild; the tailor route really does polish
 * a stale profile, read the posting, then rewrite. The clock paces them; it does
 * not make them up.
 *
 * Kept together so the wording stays in one voice — present tense while running,
 * past tense once it is behind you, and never a gerund on its own ("Reading…"
 * says what it is doing; "Loading…" says nothing).
 */

/** Uploading a resume. The first step is measured, not timed — see `ms: 0`. */
export const IMPORT_STEPS: Step[] = [
  { label: 'Uploading', past: 'Uploaded', ms: 0 },
  {
    label: 'Pulling out your jobs, dates and skills',
    past: 'Pulled out your jobs, dates and skills',
    ms: 22_000,
  },
  { label: 'Building your sections', past: 'Built your sections', ms: 2_000 },
];

/** The editorial pass. Two model calls in parallel, then the writes. */
export const POLISH_STEPS: Step[] = [
  { label: 'Checking your spelling', past: 'Checked your spelling', ms: 6_000 },
  { label: 'Grouping your skills', past: 'Grouped your skills', ms: 9_000 },
  { label: 'Rebuilding your resume', past: 'Rebuilt your resume', ms: 2_500 },
];

/**
 * Download, when the resume has changed since the last pass.
 *
 * One list, not two waits. Pressing Download and getting twenty seconds of
 * spelling correction is bewildering unless the PDF is visibly on the end of it
 * — otherwise the polish reads as something that wandered in uninvited. Showing
 * the compile as the last step is what makes the first three read as part of the
 * same errand.
 *
 * A resume that is already current never sees this: that download is a second or
 * two, which is a button label, not a wait.
 */
export const DOWNLOAD_STEPS: Step[] = [
  ...POLISH_STEPS,
  { label: 'Building your PDF', past: 'Built your PDF', ms: 4_000 },
];

/** Why a download is suddenly doing all that. Shown only when it is. */
export const DOWNLOAD_WHY =
  'Your resume has changed since it was last tidied up, so that happens first.';

/**
 * Tailoring. Three model calls, and the first only runs on a stale profile —
 * which is why it is spliced in rather than always present.
 */
export function tailorSteps(polishFirst: boolean): Step[] {
  return [
    ...(polishFirst
      ? [{ label: 'Tidying your resume first', past: 'Tidied your resume first', ms: 18_000 }]
      : []),
    { label: 'Reading the posting', past: 'Read the posting', ms: 12_000 },
    { label: 'Rewriting your experience', past: 'Rewrote your experience', ms: 25_000 },
  ];
}

/** One instruction against an existing resume. */
export const INSTRUCT_STEPS: Step[] = [
  { label: 'Rewriting', past: 'Rewritten', ms: 16_000 },
  { label: 'Saving the new version', past: 'Saved the new version', ms: 2_000 },
];

/**
 * The line that appears once a wait has run long.
 *
 * One sentence, and it does two jobs: says it is still alive, and says this is
 * not what usually happens — so somebody who has waited a minute knows whether
 * to keep waiting or to come back to it.
 */
export const REASSURE = 'Still going — this one is taking longer than usual, but it has not failed.';
