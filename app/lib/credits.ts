/**
 * How many applications are free, and when that number comes back.
 *
 * Credits were spent and never restored: creditsResetAt existed in the schema
 * and nothing read or wrote it, so after five applications an account was
 * permanently stuck — while the error it was shown promised a monthly reset
 * that did not exist.
 */

/** Free applications per calendar month. */
export const MONTHLY_CREDITS = 10;

/**
 * The first moment of next month, UTC.
 *
 * A calendar month rather than thirty days from signup, because "resets on the
 * 1st" is something a person can be told once and then predict. A rolling
 * window is fairer in the abstract and leaves everybody guessing their own
 * date.
 */
export function nextReset(from: Date = new Date()): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

/** Whether this account's month has rolled over. */
export function isDue(resetAt: Date | null | undefined, now: Date = new Date()): boolean {
  // Never set means an account from before any of this existed. Treated as due,
  // so it starts its first month rather than sitting on whatever it had left.
  if (!resetAt) return true;
  return resetAt.getTime() <= now.getTime();
}

/** How the remaining count reads. */
export function creditsLabel(credits: number): string {
  if (credits <= 0) return 'No applications left';
  if (credits === 1) return '1 application left';
  return `${credits} of ${MONTHLY_CREDITS} free left`;
}
