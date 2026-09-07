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
  gpa?: string | null,
): string {
  const field = (title ?? '').trim();
  const cred = (credential ?? '').trim();

  const head = cred && !saysCredential(field)
    ? [cred, field].filter(Boolean).join(' in ')
    : field || cred;

  // The editor has collected a GPA since it was built and nothing ever printed
  // it, so somebody typed it and it went nowhere. It sits before the honours
  // because that is the order a resume reads: what you studied, how you did,
  // then what you were given for it.
  const score = (gpa ?? '').trim();
  const grade = score ? (/\bgpa\b/i.test(score) ? score : `GPA ${score}`) : '';

  return [head, grade, (honours ?? '').trim()].filter(Boolean).join(' · ');
}

// ── Taking a written degree apart ──────────────────────────────────────────

/** Written out. A separator must follow, or it is one long degree name. */
const WRITTEN: [RegExp, string][] = [
  [/^bachelor(?:'?s)?\s+of\s+engineering\b/i, 'Bachelor of Engineering'],
  [/^bachelor(?:'?s)?\s+of\s+science\b/i, 'Bachelor of Science'],
  [/^bachelor(?:'?s)?\s+of\s+arts\b/i, 'Bachelor of Arts'],
  [/^master(?:'?s)?\s+of\s+science\b/i, 'Master of Science'],
  [/^master(?:'?s)?\s+of\s+engineering\b/i, 'Master of Engineering'],
  [/^diploma\b/i, 'Diploma'],
  [/^certificate\b/i, 'Certificate'],
];

/** Shorthand, written hard against the field, so a space is separator enough. */
const SHORTHAND: [RegExp, string][] = [
  [/^b\.?\s?eng\.?/i, 'Bachelor of Engineering'],
  [/^b\.?\s?sc\.?/i, 'Bachelor of Science'],
  [/^b\.?\s?s\.?(?=\s|$)/i, 'Bachelor of Science'],
  [/^b\.?\s?a\.?(?=\s|$)/i, 'Bachelor of Arts'],
  [/^m\.?\s?eng\.?/i, 'Master of Engineering'],
  [/^m\.?\s?sc\.?/i, 'Master of Science'],
  [/^m\.?\s?s\.?(?=\s|$)/i, 'Master of Science'],
];

const FIELD_SEPARATOR = /^\s*(?:in|[-–—:,])\s+/i;

/** What a resume puts between a degree and a prize. */
const HONOURS_MARK = /\s*[·•|]\s*/;
const HONOURS_WORDS =
  /\b(dean'?s list|president'?s list|honou?rs?|with distinction|distinction|summa cum laude|magna cum laude|cum laude|valedictorian|first class|second class)\b/i;

export interface Degree {
  /** The field of study, as it belongs in the title column. */
  title: string;
  /** One of CREDENTIALS, or null when the line does not open with one we hold. */
  credential: string | null;
  honours: string | null;
}

function liftHonours(text: string): { text: string; honours: string | null } {
  const parts = text.split(HONOURS_MARK);
  if (parts.length > 1) {
    const tail = parts.pop()!.trim();
    return { text: parts.join(' · ').trim(), honours: tail || null };
  }

  // A comma or a bracket, but only when the tail actually names an honour:
  // "Bachelor of Science, Computer Science" is a field of study, not a prize.
  // A GPA is left where it is on purpose — nothing prints extra.gpa yet, so
  // lifting it out of here would delete it from the resume.
  const tail = /[,(]\s*([^,()]+)\)?\s*$/.exec(text);
  if (tail && HONOURS_WORDS.test(tail[1]) && !/\bgpa\b|\d\.\d/i.test(tail[1])) {
    return { text: text.slice(0, tail.index).trim(), honours: tail[1].trim() };
  }
  return { text, honours: null };
}

function liftCredential(text: string): { title: string; credential: string | null } {
  for (const [pattern, credential] of WRITTEN) {
    const match = pattern.exec(text);
    if (!match) continue;
    const rest = text.slice(match[0].length);
    if (!rest.trim()) return { title: '', credential };
    // The separator is what makes this a credential and a field rather than one
    // long name: "Bachelor of Engineering Technology" is not a Bachelor of
    // Engineering in Technology, and splitting it renames somebody's degree.
    if (!FIELD_SEPARATOR.test(rest)) return { title: text, credential: null };
    return { title: rest.replace(FIELD_SEPARATOR, '').trim(), credential };
  }

  for (const [pattern, credential] of SHORTHAND) {
    const match = pattern.exec(text);
    if (!match) continue;
    const rest = text.slice(match[0].length);
    if (!rest.trim()) return { title: '', credential };
    if (!/^[\s,:\-–—]/.test(rest)) return { title: text, credential: null };
    return {
      title: rest.replace(FIELD_SEPARATOR, '').replace(/^[\s,:\-–—]+/, '').trim(),
      credential,
    };
  }

  return { title: text, credential: null };
}

/**
 * A degree line, split into the boxes the editor actually has.
 *
 * An uploaded resume writes it as one phrase because a page has nowhere else to
 * put it. Left whole, the form shows an empty credential chip beside a field of
 * study that already contains the credential — and filling that chip in used to
 * print it twice.
 *
 * Everything it returns is an exact substring of what it was given, except a
 * shorthand credential expanded to its chip value, which is what the chip's own
 * help text asks for. A credential we hold no chip for stays in the title
 * rather than being written into a field with nowhere to show it.
 */
export function splitDegree(degree: string | null | undefined): Degree {
  const whole = (degree ?? '').trim().replace(/\s{2,}/g, ' ');
  if (!whole) return { title: '', credential: null, honours: null };

  const { text, honours } = liftHonours(whole);
  const { title, credential } = liftCredential(text);
  return { title, credential, honours };
}
