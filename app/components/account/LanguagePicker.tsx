'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LOCALE_OPTIONS } from '../../lib/locales';
import { saveLocale } from '../../server/actions';

/**
 * Which English the resumes come out in.
 *
 * Saves on choice rather than behind a button: there is one field, the options
 * are exclusive, and a Save next to a set of radios is a step that exists only
 * to be forgotten. The previous value goes back if the write fails, so the
 * screen never claims a setting that did not land.
 *
 * The samples matter more than the labels. "Canadian English" is an abstraction;
 * seeing that it means "colour, licence, organise" is what lets somebody tell
 * whether their resume is about to look wrong to the person reading it.
 */
export default function LanguagePicker({ current }: { current: string }) {
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  function choose(next: string) {
    if (next === value) return;
    const previous = value;
    setValue(next);
    setFailed(false);
    startTransition(async () => {
      try {
        await saveLocale(next);
        router.refresh();
      } catch {
        setValue(previous);
        setFailed(true);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        {LOCALE_OPTIONS.map((option) => {
          const on = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => choose(option.value)}
              disabled={pending}
              aria-pressed={on}
              className={`flex items-center justify-between gap-4 rounded border px-3.5 py-2.5 text-left transition disabled:opacity-60 ${
                on
                  ? 'border-accent-line bg-accent-tint'
                  : 'border-rule-field bg-ground-surface hover:border-ink-faint'
              }`}
            >
              <span className="flex flex-col gap-0.5">
                <span className={`text-[14px] ${on ? 'text-ink' : 'text-ink-prose'}`}>
                  {option.label}
                </span>
                <span className="text-[12.5px] text-ink-faint">{option.sample}</span>
              </span>
              {on ? (
                <span className="flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full bg-accent">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {failed ? (
        <p className="text-[12.5px] text-flag">
          That did not save. Check your connection and choose again.
        </p>
      ) : (
        <p className="text-[12.5px] leading-relaxed text-ink-muted">
          Applies the next time a resume is written or polished. Resumes you have already
          generated keep the spelling they were made with.
        </p>
      )}
    </div>
  );
}
