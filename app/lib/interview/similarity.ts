import type { FactCategory } from '../types';

/**
 * Near-duplicate question detection.
 *
 * The prompt already forbids repeating a question, but instructions alone did
 * not hold: when an answer never addressed the question, the model reliably
 * reworded and re-asked it several turns running. Asking the same thing four
 * ways is the fastest way to make an interview feel like a broken form, so the
 * guard is enforced in code rather than requested.
 *
 * Wording alone is not a sufficient signal. "Roughly how many users did the
 * payments system serve?" and "Roughly how many users did Resumi serve?" share
 * almost every word yet are different questions, while a genuine repeat may be
 * reworded heavily. So the target the model declares — which entry and which
 * category the question is chasing — is weighed alongside the wording.
 */

export interface AskedQuestion {
  text: string;
  entryId: string | null;
  category: FactCategory;
}

const STOPWORDS = new Set([
  'a', 'about', 'an', 'and', 'any', 'anything', 'are', 'as', 'at', 'be', 'been', 'but', 'by',
  'can', 'did', 'do', 'does', 'else', 'for', 'from', 'had', 'has', 'have', 'how', 'i',
  'if', 'in', 'is', 'it', 'its', 'just', 'like', 'main', 'me', 'more', 'much', 'my', 'of', 'on',
  'or', 'other', 'others', 'our', 'out', 'over', 'so', 'some', 'that', 'the', 'their', 'them',
  'then', 'there', 'these', 'they', 'this', 'those', 'to', 'up', 'was', 'we', 'were', 'what',
  'when', 'where', 'which', 'who', 'why', 'will', 'with', 'would', 'you', 'your', 'yourself',
  'let', 'lets', 'tell', 'know', 'want', 'wanted', 'include', 'included', 'thing', 'things',
  'another', 'besides', 'beside', 'before', 'after', 'also', 'really', 'actually', 'maybe',
]);

/**
 * Crude singular form. Real repeats alternate freely between "project" and
 * "projects", which a plain token match treats as unrelated words — that alone
 * hid one of the four repeats observed in testing.
 */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Lowercased, stemmed content words, stripped of punctuation and stopwords. */
export function contentWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map(stem)
    .filter((w) => !STOPWORDS.has(w));
  return new Set(words);
}

/**
 * Overlap coefficient: |A ∩ B| / min(|A|, |B|).
 *
 * Chosen over Jaccard because a reworded question is often shorter or longer
 * than the original, and Jaccard's union denominator lets that length
 * difference disguise a near-duplicate.
 */
export function questionSimilarity(a: string, b: string): number {
  const wa = contentWords(a);
  const wb = contentWords(b);
  if (wa.size === 0 || wb.size === 0) return 0;

  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;

  return shared / Math.min(wa.size, wb.size);
}

/**
 * Two questions chasing the same thing need only be recognisably similar to
 * count as a repeat. Two chasing different subjects must be near-identical,
 * since sharing a sentence frame across different entries is normal and good.
 */
export const SAME_TARGET_THRESHOLD = 0.55;
export const DIFFERENT_TARGET_THRESHOLD = 0.85;

function sameTarget(a: AskedQuestion, b: AskedQuestion): boolean {
  return a.entryId === b.entryId;
}

/** The first prior question the candidate duplicates, or null. */
export function findDuplicate(candidate: AskedQuestion, prior: AskedQuestion[]): AskedQuestion | null {
  for (const asked of prior) {
    const threshold = sameTarget(candidate, asked) ? SAME_TARGET_THRESHOLD : DIFFERENT_TARGET_THRESHOLD;
    if (questionSimilarity(candidate.text, asked.text) >= threshold) return asked;
  }
  return null;
}
