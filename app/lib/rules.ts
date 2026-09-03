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
