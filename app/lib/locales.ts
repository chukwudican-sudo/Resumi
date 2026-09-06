/**
 * Which English a person's resumes come out in.
 *
 * One list, because two would drift: the picker on the account page and the
 * instruction handed to the model are the same four rows read twice. Keeping
 * the spelling map here rather than in systemPrompt.ts also keeps the tailoring
 * prompts out of any client bundle that needs the options.
 *
 * Until this existed nothing could write users.locale, so every account sat on
 * the en-CA default however far from Canada it was.
 */

export interface LocaleOption {
  value: string;
  /** What the person picks. */
  label: string;
  /** What actually changes, in words anybody recognises. */
  sample: string;
  /** The line the model is given. */
  instruction: string;
}

export const DEFAULT_LOCALE = 'en-CA';

export const LOCALE_OPTIONS: LocaleOption[] = [
  {
    value: 'en-CA',
    label: 'Canadian English',
    sample: 'colour, licence, organise',
    instruction:
      'Canadian English spelling (colour, programme, licence, organise) — never American spelling',
  },
  {
    value: 'en-US',
    label: 'American English',
    sample: 'color, license, organize',
    instruction:
      'American English spelling (color, program, license, organize) — never British spelling',
  },
  {
    value: 'en-GB',
    label: 'British English',
    sample: 'colour, licence, organise',
    instruction:
      'British English spelling (colour, programme, licence, organise) — never American spelling',
  },
  {
    value: 'en-AU',
    label: 'Australian English',
    sample: 'colour, licence, organise',
    instruction:
      'Australian English spelling (colour, programme, licence, organise) — never American spelling',
  },
];

/** Whether a value names a locale this app knows how to write in. */
export function isKnownLocale(value: unknown): value is string {
  return typeof value === 'string' && LOCALE_OPTIONS.some((o) => o.value === value);
}

/** The spelling instruction for a locale, falling back rather than throwing. */
export function spellingFor(locale: string | null | undefined): string {
  const match = LOCALE_OPTIONS.find((o) => o.value === locale);
  return (match ?? LOCALE_OPTIONS[0]).instruction;
}

/** How a stored locale reads on screen. Unknown values show themselves. */
export function localeLabel(locale: string | null | undefined): string {
  return LOCALE_OPTIONS.find((o) => o.value === locale)?.label ?? locale ?? 'Canadian English';
}
