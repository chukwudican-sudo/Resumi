/**
 * Shared constants for the rules feature.
 *
 * Lives here rather than in actions.ts because a `'use server'` file may only
 * export async functions — a plain constant there fails the build with an error
 * that typecheck does not produce, so the split is load-bearing rather than
 * organisational.
 */

/** Long enough for a real instruction, short enough to stay a rule. */
export const RULE_MAX_LENGTH = 280;

/**
 * What a rule can be checked for, when it can be checked at all.
 *
 * Derived once, by a model, from the sentence somebody typed — never instead of
 * it. The rule is their words; this is the app's reading of them, kept beside it
 * and shown on the page so a wrong reading is visible rather than mysterious.
 *
 * Two kinds on purpose. Between them they cover the rules this app already
 * suggests as examples, and every further kind is another way to be confidently
 * wrong about what somebody meant. More can follow once real rules ask for them.
 */
export type RuleCheck =
  /** "Never use the word spearheaded." "Call it Ontario Tech, never UOIT." */
  | { kind: 'forbidden_text'; terms: string[] }
  /** "Keep every bullet to one line." */
  | { kind: 'max_bullet_chars'; limit: number };

/** Whether a rule held on one resume, and where it did not. */
export interface RuleResult {
  ruleId: string;
  text: string;
  /**
   * `guidance` is not a failure and not a pass.
   *
   * Most rules are advice — "lead with impact, then the technology" — and there
   * is no honest way to verify one. Saying so is the point: guidance that
   * displayed as a tick would be claiming an enforcement that never happened.
   */
  verdict: 'pass' | 'fail' | 'guidance';
  /** Only on a failure. "\u201cUOIT\u201d is in your education entry." */
  evidence?: string;
  /** What would fix it, ready for the instruction box. */
  fix?: string;
}

/** A rule as the checker needs it. */
export interface CheckableRule {
  id: string;
  text: string;
  check: RuleCheck | null;
}

/** What the page says a check means, in the person's terms rather than the app's. */
export function describeCheck(check: RuleCheck | null): string | null {
  if (!check) return null;
  if (check.kind === 'forbidden_text') {
    const quoted = check.terms.map((t) => `\u201c${t}\u201d`).join(', ');
    return `Checked \u2014 your resume must not contain ${quoted}.`;
  }
  return `Checked \u2014 no bullet longer than ${check.limit} characters.`;
}
