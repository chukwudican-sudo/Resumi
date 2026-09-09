/**
 * How well somebody speaks a language, split into a level and everything else.
 *
 * A Languages row is stored the way every other label-and-value row is stored —
 * one category and one string — because the resume prints one line and the
 * storage should not invent structure the page does not have. The editor shows
 * it as two controls, so the split lives here rather than in a component.
 *
 * The level is a picker because every application form asks for one of the same
 * six words and typing "Conversational" from memory each time is work nobody
 * should do. The rest is free text because real resumes carry things no list
 * has: "DELF B2", "JLPT N2", "C1 (CEFR)", and one upload that arrived here
 * saying "Conversational (test entry)".
 */

export const LEVELS = ['Native', 'Fluent', 'Advanced', 'Intermediate', 'Conversational', 'Basic'];

export interface Proficiency {
  level: string;
  /** A certificate, a scale, a caveat. Printed in brackets after the level. */
  note: string;
}

/**
 * A stored value back into the two boxes.
 *
 * Reads the LAST bracketed group as the note, so "Advanced (DELF B2) (spoken)"
 * keeps the certificate with the level and takes only the trailing aside — the
 * alternative splits somebody's certificate in half.
 */
export function splitLevel(value: string): Proficiency {
  const text = (value ?? '').trim();
  const match = /^(.*\S)\s*\(([^()]*)\)$/.exec(text);
  if (!match) return { level: text, note: '' };
  return { level: match[1].trim(), note: match[2].trim() };
}

/** The two boxes back into one stored value. */
export function joinLevel({ level, note }: Proficiency): string {
  const l = (level ?? '').trim();
  const n = (note ?? '').trim();
  if (!l) return n;
  return n ? `${l} (${n})` : l;
}

/**
 * The options one row's picker should offer.
 *
 * The six, plus whatever is already there. An imported "Native / Fluent" is not
 * on the list and must not be quietly swapped for something that is — the
 * picker shows it as its own option and leaves it selected.
 */
export function levelOptions(current: string): string[] {
  const level = (current ?? '').trim();
  if (!level || LEVELS.includes(level)) return LEVELS;
  return [level, ...LEVELS];
}
