'use client';

import Stages, { type Step } from './Stages';
import { REASSURE } from '../lib/waits';

/**
 * The whole window, for as long as it takes.
 *
 * For the operations that replace what you were looking at — importing a resume,
 * which wipes and rebuilds the entire profile, and tailoring, which produces a
 * whole workspace from nothing. Leaving the old screen up behind a small panel
 * would be showing somebody a thing that is already gone.
 *
 * **Nothing to press.** No Back, no Cancel, no Escape. Not an oversight: none of
 * these can actually be stopped — an import replaces your profile whether or not
 * you are still watching — so a cancel button would be lying about what it does.
 * The browser's own back arrow still works, as it does everywhere else in the app
 * now, and that is the escape.
 *
 * A failure always takes this down and says why, so a dropped connection cannot
 * strand anybody: the model client times out inside the function's budget, which
 * puts a ceiling of about a minute on the worst case.
 */
export default function Takeover({
  title,
  steps,
  done,
  percent,
  estimate,
}: {
  /** What is happening, as a sentence. "Reading your resume." */
  title: string;
  steps: Step[];
  done: boolean;
  percent?: number;
  estimate?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex animate-[fadeIn_180ms_ease-out] flex-col bg-ground">
      {/* The mark, and nothing else. An anchor, not a control — there is
          deliberately nothing here to press. */}
      <div className="flex h-[62px] shrink-0 items-center px-7">
        <span className="flex items-center gap-2.5">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2F5D50" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18" />
          </svg>
          <span className="text-[12.5px] uppercase tracking-[0.16em] text-ink-prose">Resumi</span>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-7 pb-16">
        <div className="w-full max-w-[420px]">
          <h1 className="mb-7 font-serif text-[34px] leading-[1.08] tracking-[-0.01em] sm:text-[40px]">
            {title}
          </h1>
          <Stages
            steps={steps}
            done={done}
            percent={percent}
            estimate={estimate}
            reassure={REASSURE}
          />
        </div>
      </div>
    </div>
  );
}
