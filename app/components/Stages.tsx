'use client';

import { useEffect, useRef, useState } from 'react';
import Spinner from './Spinner';

/** One thing the operation does, in the order it does it. */
export interface Step {
  /** Present tense, while it is the one running. */
  label: string;
  /** Past tense, once it is behind you. Falls back to `label`. */
  past?: string;
  /** What the clock allows it. Ignored for the last step — see below. */
  ms: number;
}

/** How long before the wait admits it is taking longer than it should. */
const REASSURE_AFTER = 25_000;
/** How long everything sits ticked before the caller is told to put it away. */
const SETTLE = 700;

/**
 * What the app is doing, while it does it.
 *
 * **The timing is simulated. Finishing is not.** The steps advance on a clock,
 * because nothing here streams and the server speaks once, at the end — but the
 * LAST step never ticks until the real work has resolved. If the model runs
 * long, that line keeps spinning rather than claiming to be done.
 *
 * That distinction is the whole design. A single honest line was tried first and
 * rejected for the right reason: it sits there, and a wait that never moves
 * reads as a wait that has died. A tick that arrives a second early is pacing; a
 * tick that says "finished" over something still running is a lie, and only the
 * last one is ever in a position to tell it.
 *
 * The steps are true to what each operation actually does — polish really does
 * proofread, then group skills, then rebuild. They are not invented to fill time.
 */
export default function Stages({
  steps,
  done,
  percent,
  estimate,
  reassure,
  onSettled,
}: {
  steps: Step[];
  /** The real work has resolved. Until this, the last step keeps spinning. */
  done: boolean;
  /**
   * 0–100 on the first step, measured off real bytes.
   *
   * The only number anywhere in the app. Everything else would be a guess
   * dressed as a measurement.
   */
  percent?: number;
  /** "Usually about thirty seconds." Sets the expectation, once. */
  estimate?: string;
  /** Shown after 25 seconds, if it gets that far. */
  reassure?: string;
  /** Called once everything has been ticked for a beat. Put the wait away. */
  onSettled?: () => void;
}) {
  const [active, setActive] = useState(0);
  const [late, setLate] = useState(false);
  const settled = useRef(false);

  // The clock, walking up to — but never onto — the last step.
  useEffect(() => {
    if (active >= steps.length - 1) return;
    const t = setTimeout(() => setActive((i) => i + 1), steps[active]?.ms ?? 1200);
    return () => clearTimeout(t);
  }, [active, steps]);

  useEffect(() => {
    if (!reassure) return;
    const t = setTimeout(() => setLate(true), REASSURE_AFTER);
    return () => clearTimeout(t);
  }, [reassure]);

  // Done means done: every step ticks, wherever the clock had got to. Work that
  // finishes faster than predicted should look finished, not keep pretending.
  useEffect(() => {
    if (!done || settled.current) return;
    settled.current = true;
    setActive(steps.length);
    const t = setTimeout(() => onSettled?.(), SETTLE);
    return () => clearTimeout(t);
  }, [done, steps.length, onSettled]);

  return (
    <div role="status" aria-live="polite">
      <ol className="flex flex-col">
        {steps.map((step, i) => {
          const isDone = i < active;
          const isNow = i === active;
          return (
            <li
              key={step.label}
              className={`flex items-center gap-3 py-2 text-[13.5px] transition-colors duration-300 ${
                isDone ? 'text-ink-prose' : isNow ? 'text-ink' : 'text-ink-ghost'
              }`}
            >
              <span className="grid h-4 w-4 shrink-0 place-items-center">
                {isDone ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2F5D50" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : isNow ? (
                  <Spinner />
                ) : (
                  <span aria-hidden="true" className="h-[11px] w-[11px] rounded-full border-[1.5px] border-rule-field" />
                )}
              </span>

              <span className="min-w-0">{isDone ? step.past ?? step.label : step.label}</span>

              {i === 0 && isNow && percent != null ? (
                <span className="ml-auto shrink-0 text-[12px] tabular-nums text-ink-muted">
                  {Math.round(percent)}%
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      {estimate ? <p className="mt-3 text-[12.5px] text-ink-faint">{estimate}</p> : null}

      {/*
        A clock, not a guess. It claims no progress — it says the one thing that
        stops a slow operation reading as a dead one. Amber, because the palette
        has no red and nothing here is an error.
      */}
      {reassure && late && !done ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-flag-ink">{reassure}</p>
      ) : null}
    </div>
  );
}
