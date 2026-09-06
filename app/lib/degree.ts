/**
 * A degree line, and where its pieces belong.
 *
 * A resume writes the whole thing as one phrase — "Bachelor of Engineering in
 * Software Engineering · Dean's List" — because a page has nowhere else to put
 * it. The app does have somewhere else: the credential is a chip and the
 * honours are their own field. So the phrase has to be composed for the page
 * and taken apart for the form, and neither may say the same thing twice.
 *
 * The same shape as employment.ts, for the same reason: a fixed list matched
 * exactly, costing nothing and never subject to a model's reading of what a
 * word meant.
 */

/** The ones that cover almost everybody; anything else stays free text. */
export const CREDENTIALS = [
  'Bachelor of Engineering',
  'Bachelor of Science',
  'Bachelor of Arts',
  'Master of Science',
  'Master of Engineering',
  'Diploma',
  'Certificate',
];

/**
 * Whether the text already names a degree.
 *
 * Broader than CREDENTIALS on purpose. The question here is not "is this one of
 * our chips" but "would adding a chip repeat something already said", and a
 * title reading "Doctor of Philosophy in Physics" answers yes to the second
 * while answering no to the first.
 */
export function saysCredential(text: string | null | undefined): boolean {
  return /\b(bachelors?|masters?|doctor|doctorate|associate|diploma|certificate|ph\.?\s?d|b\.?\s?sc|b\.?\s?eng|b\.?\s?a|m\.?\s?sc|m\.?\s?eng|mba)\b/i.test(
    (text ?? '').trim(),
  );
}

/**
 * The degree as it prints.
 *
 * The credential and the field read as one phrase, and a field of study alone
 * leaves a reader guessing at the level — so they are joined. But a title that
 * already names the degree does not get given another one.
 *
 * That guard is the whole point of this function. An entry imported from an
 * uploaded resume holds the entire phrase in its title, with the credential
 * chip empty beside it; clicking the chip to fill it in printed "Bachelor of
 * Engineering in Bachelor of Engineering in Software Engineering · Dean's
 * List". Already said, so not said twice — the rule titleWithEmployment holds.
 */
export function composeDegree(
  credential: string | null | undefined,
  title: string | null | undefined,
  honours?: string | null,
): string {
  const field = (title ?? '').trim();
  const cred = (credential ?? '').trim();

  const head = cred && !saysCredential(field)
    ? [cred, field].filter(Boolean).join(' in ')
    : field || cred;

  return [head, (honours ?? '').trim()].filter(Boolean).join(' · ');
}
