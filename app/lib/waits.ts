import type { Step } from '../components/Stages';

/**
 * What each long operation is doing, in the order it does it.
 *
 * Drawn from what the code actually does rather than invented to fill time —
 * `runPolish` really does proofread, group skills, order sections and rebuild;
 * the tailor route really does polish a stale profile, call the model, run the
 * guard and save a version.
 *
 * **The clock paces them; the work decides when they finish.** `Stages` walks
 * the list on a timer and then holds on the last one until the real promise
 * resolves, so nothing ever claims to be done while it is still running. Where a
 * single model call is shown as more than one step — the middle of a tailor —
 * the split describes real parts of that call's job, and is marked as such
 * below. A wait that never moves reads as a wait that has died.
 *
 * Present tense while running, past tense once behind you. Never a bare
 * "Loading": every line says what is being done.
 */

/** Uploading a resume. The first step is measured, not timed — hence `ms: 0`. */
export const IMPORT_STEPS: Step[] = [
  { label: 'Uploading', past: 'Uploaded', ms: 0 },
  { label: 'Reading your resume', past: 'Read your resume', ms: 18_000 },
  { label: 'Sorting out your sections', past: 'Sorted out your sections', ms: 4_000 },
  { label: 'Saving it to your profile', past: 'Saved it to your profile', ms: 2_000 },
];

/** The editorial pass: two model calls in parallel, then the writes. */
export const POLISH_STEPS: Step[] = [
  { label: 'Checking your spelling', past: 'Checked your spelling', ms: 5_000 },
  { label: 'Grouping your skills', past: 'Grouped your skills', ms: 7_000 },
  { label: 'Putting your sections in order', past: 'Put your sections in order', ms: 3_000 },
  { label: 'Rebuilding your resume', past: 'Rebuilt your resume', ms: 2_500 },
];

/**
 * Download, when the resume has changed since the last pass.
 *
 * One list with the PDF on the end. Press Download, get twenty seconds of
 * spelling correction, and the polish reads as something that wandered in
 * uninvited — unless you can see where it is going.
 */
export const DOWNLOAD_STEPS: Step[] = [
  ...POLISH_STEPS,
  { label: 'Building your PDF', past: 'Built your PDF', ms: 4_000 },
];

/** Why a download is suddenly doing all that. Shown only when it is. */
export const DOWNLOAD_WHY =
  'Your resume has changed since it was last tidied up, so that happens first.';

/**
 * Tailoring.
 *
 * It used to open with "Tidying your resume first", because the editorial pass
 * ran here — two model calls and some twenty-five serialised database round
 * trips, in front of somebody waiting on a job application. It runs when you
 * press Done on the resume page now, so this is one model call.
 *
 * The last two steps are real and separate from that call: the guard that
 * checks no entry was dropped or invented, and the write.
 *
 * The three in the middle are that one call shown as three. They are the three
 * things it is doing — read the posting, match it against the profile, rewrite
 * around it — and nothing can see inside to know when one ends. A single line
 * sitting still for thirty seconds is the failure this exists to avoid.
 */
export const TAILOR_STEPS: Step[] = [
  { label: 'Reading the posting', past: 'Read the posting', ms: 6_000 },
  { label: "Matching it against what you've done", past: "Matched it against what you've done", ms: 9_000 },
  { label: 'Rewriting your experience', past: 'Rewrote your experience', ms: 12_000 },
  { label: 'Checking nothing was invented', past: 'Checked nothing was invented', ms: 3_000 },
  { label: 'Saving this version', past: 'Saved this version', ms: 2_000 },
];

/**
 * Pasting a posting through to a finished resume — two calls, one wait.
 *
 * The first step is a real separate call (the extraction that reads the
 * posting); the rest are the tailor. It is one list because it is one journey:
 * pressing a button, watching a spinner on it, landing on a second screen and
 * pressing a second button was asking the same question twice.
 *
 * Paced a little longer than TAILOR_STEPS because there is genuinely more work
 * behind it — an extraction of about eight seconds in front of a tailor of
 * about thirty.
 */
export const NEW_APPLICATION_STEPS: Step[] = [
  { label: 'Reading the posting', past: 'Read the posting', ms: 9_000 },
  { label: "Matching it against what you've done", past: "Matched it against what you've done", ms: 9_000 },
  { label: 'Rewriting your experience', past: 'Rewrote your experience', ms: 13_000 },
  { label: 'Checking nothing was invented', past: 'Checked nothing was invented', ms: 3_000 },
  { label: 'Saving this version', past: 'Saved this version', ms: 2_000 },
];

/** One instruction against an existing resume. */
export const INSTRUCT_STEPS: Step[] = [
  { label: 'Reading what you asked for', past: 'Read what you asked for', ms: 4_000 },
  { label: 'Rewriting', past: 'Rewritten', ms: 12_000 },
  { label: 'Saving the new version', past: 'Saved the new version', ms: 2_000 },
];

/**
 * The line that appears once a wait has run long.
 *
 * One sentence doing two jobs: it is still alive, and this is not what usually
 * happens — so somebody a minute in knows whether to keep waiting or come back.
 */
export const REASSURE = 'Still going — this one is taking longer than usual, but it has not failed.';
