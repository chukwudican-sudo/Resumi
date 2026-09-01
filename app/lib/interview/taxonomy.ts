import type { EntryKind, FactCategory } from '../types';

/**
 * The fact taxonomy, shared by the coverage calculator and the interview
 * prompt. Both must describe categories identically — if the prompt's idea of
 * "scope" drifts from what coverage counts as scope, the model will answer gaps
 * that never close and the interview will loop.
 */

export const FACT_CATEGORY_DESCRIPTIONS: Record<FactCategory, string> = {
  action: 'What the person actually did — the verb and its object. "Built the payment retry pipeline."',
  metric: 'A concrete number showing size or change. "Cut p95 latency from 800ms to 240ms." A claim of improvement with no number is NOT a metric.',
  scope: 'The scale they operated at — team size, user count, request volume, budget, how much of the system they owned.',
  tooling: 'Specific languages, frameworks, services, and infrastructure used.',
  outcome: 'What changed as a result, for the business or the user — distinct from the action itself.',
  context: 'The constraint or situation that made the work non-trivial. Why it was hard or why it mattered.',
  skill: 'A capability that is not tied to a single role or project.',
  credential: 'A degree, certification, or award.',
  preference: 'How the person wants their resume written — tone, emphasis, things to leave out.',
  identity: 'Name, contact details, location, work authorization.',
};

/**
 * What an entry needs, depending on how much attention it will get.
 *
 * Not every entry deserves the same depth. A reader spends most of their
 * attention on the two or three most recent things; everything else is there to
 * show range, and a portfolio site does not need scope, outcome and context —
 * it needs one line saying what it is.
 *
 * Requiring all six of everything is what made the interview grow with the
 * length of someone's history: ten entries meant sixty gaps, so being thorough
 * about your past was punished with a forty-question interview.
 */
export const DEEP_REQUIRED_CATEGORIES: FactCategory[] = [
  'action',
  'metric',
  'scope',
  'tooling',
  'outcome',
  'context',
];

/** Enough to write an honest line about something. */
export const SHALLOW_REQUIRED_CATEGORIES: FactCategory[] = ['action', 'tooling'];

/**
 * How many entries of each kind get the full treatment, most recent first.
 *
 * Two jobs and one project is roughly what a one-page resume can carry in
 * detail anyway, so going deeper on more of them would produce material that
 * gets cut at tailoring time.
 */
export const DEEP_ENTRY_LIMIT: Record<string, number> = {
  experience: 2,
  project: 1,
};

/** Kept for callers that only need the full list. */
export const ENTRY_REQUIRED_CATEGORIES = DEEP_REQUIRED_CATEGORIES;

/** Entry kinds that are scored against ENTRY_REQUIRED_CATEGORIES. */
export const SCORED_ENTRY_KINDS: EntryKind[] = ['experience', 'project'];

/**
 * Relative worth of closing a gap in each category. Metrics and scope are what
 * make a resume bullet land, so they outrank context.
 */
export const CATEGORY_WEIGHTS: Record<FactCategory, number> = {
  metric: 3,
  scope: 2.5,
  outcome: 2,
  action: 1.5,
  tooling: 1.5,
  context: 1,
  skill: 1.5,
  credential: 1,
  preference: 0.5,
  identity: 2,
};

/**
 * True when the text contains a quantity that could anchor a resume bullet.
 *
 * A bare digit is not enough: "joined in 2019" and "Q4" contain digits but say
 * nothing about scale, and letting them satisfy a metric gap is exactly how an
 * interview stops asking the question that matters most. Standalone years and
 * quarter labels are therefore discounted, while anything attached to a unit,
 * a percentage, a currency, or a multiplier counts.
 */
export function hasMeaningfulNumber(text: string): boolean {
  if (!text) return false;

  // Percentages, money, multipliers, and ranges are always meaningful.
  if (/(\d+(\.\d+)?\s*%|[$£€]\s*\d|\d+(\.\d+)?\s*[xX]\b)/.test(text)) return true;

  // Numbers carrying a unit or a scale suffix.
  if (/\d+(\.\d+)?\s*(k|m|b|bn|ms|s|sec|min|hr|hours?|days?|weeks?|months?|years?|gb|mb|tb|kb|qps|rps|req|users?|customers?|people|engineers?|devs?|developers?|members?|teams?|clients?|records?|rows?|queries?|requests?|tests?|repos?|services?|endpoints?|models?|languages?|countries?|stores?|locations?)\b/i.test(text)) {
    return true;
  }

  // Otherwise, look for any number that is not merely a year or a quarter.
  const numbers = text.match(/\d+(\.\d+)?/g);
  if (!numbers) return false;
  return numbers.some((n) => {
    const value = Number(n);
    const isYear = /^(19|20)\d{2}$/.test(n);
    // A small integer like "4" in "team of 4" is meaningful; a year is not.
    return !isYear && Number.isFinite(value);
  });
}
