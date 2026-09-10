'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { polishMasterResume, undoPolish } from '../../server/actions';
import { useUndo } from '../undo/UndoProvider';

/**
 * Hands the editorial decisions to the model, and shows what it decided.
 *
 * Deliberately not silent. The pass renames and regroups your skills, reorders
 * your sections and may correct a misspelled city — all improvements, and all
 * things you would be entitled to be annoyed about discovering by accident on a
 * resume you had already sent. So it reports back: what it fixed, and what it
 * thinks is still weak.
 */
export default function PolishButton({
  stale,
  disabled = false,
}: {
  stale: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    warnings: string[];
    corrections: { from: string; to: string; reason: string }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { dismiss } = useUndo();
  /**
   * Whether this pass can still be taken back.
   *
   * 'gone' is the honest answer after an edit: the copy taken before the pass
   * is thrown away by the next save, because applying it then would delete the
   * edit along with the polish. Saying so beats a button that quietly does
   * nothing.
   */
  const [undoState, setUndoState] = useState<'ready' | 'undoing' | 'done' | 'gone'>('ready');

  async function revert() {
    setUndoState('undoing');
    try {
      const ok = await undoPolish();
      setUndoState(ok ? 'done' : 'gone');
      if (ok) router.refresh();
    } catch {
      setUndoState('gone');
    }
  }

  function run() {
    setError(null);
    // A polish rewrites bullets across every entry, so any offer still standing
    // is about text that has just moved underneath it — taking it away is what
    // stops Undo writing a pre-polish value back over the pass. Undoing the
    // pass itself is a different mechanism entirely, and it lives in the panel
    // below: three tables restored at once, not one row put back.
    dismiss();
    startTransition(async () => {
      try {
        const outcome = await polishMasterResume();
        setResult({ warnings: outcome.warnings, corrections: outcome.corrections });
        setUndoState('ready');
        router.refresh();
      } catch {
        setError("That didn't go through. Try again in a moment.");
      }
    });
  }

  return (
    // The results hang below the button rather than sitting in the flow.
    // Inline, they stretched a 62px toolbar to fit a paragraph and spilled
    // across the resume preview beside it.
    <div className="relative flex items-center gap-2">
      {/*
        One signal, not three. The button used to swap between filled and
        outlined and rename itself "Polished", which meant the state lived in
        how a button looked — and a filled button next to two other filled
        buttons says nothing at a glance. A dot on the corner is the thing
        people already read as "there is something here".
      */}
      <span className="relative flex">
        <button
          type="button"
          onClick={run}
          disabled={pending || disabled}
          className="flex items-center gap-2 rounded bg-accent px-4 py-2 text-[13px] font-medium text-ground transition hover:bg-accent-hover disabled:opacity-50"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8-4.9-3.6L7.1 18l1.9-5.8L4 8.8h6.1z" />
          </svg>
          {pending ? 'Polishing…' : 'Polish resume'}
          {/* The dot is a picture; this is the same fact for a screen reader. */}
          {stale && !pending ? <span className="sr-only"> — changes since the last pass</span> : null}
        </button>

        {stale && !pending ? (
          // Sits half outside the corner with a ring in the bar's own colour, so
          // it reads as attached to the button rather than printed on it — and
          // stays legible against both the green fill and the white behind.
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-flag ring-2 ring-ground-surface"
          />
        ) : null}
      </span>

      {error ? <span className="text-[12px] text-flag">{error}</span> : null}

      {result ? (
        <div className="absolute right-0 top-full z-50 mt-2 max-h-[70vh] w-[360px] overflow-y-auto rounded-lg border border-rule bg-ground-surface p-4 text-left shadow-xl shadow-ink/10">
          <div className="mb-2.5 flex items-start justify-between gap-4">
            <span className="font-serif text-[15px] leading-tight">What I changed</span>
            <button
              type="button"
              onClick={() => setResult(null)}
              aria-label="Dismiss"
              className="-mt-0.5 shrink-0 rounded p-1 text-ink-faint transition hover:bg-ground-panel hover:text-ink"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          {result.corrections.length ? (
            <>
              <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">Corrected</span>
              <ul className="mt-1.5 mb-3 flex flex-col gap-1">
                {result.corrections.map((c) => (
                  <li key={c.from} className="text-[12.5px] leading-snug text-ink-prose">
                    <span className="text-ink-ghost line-through">{c.from}</span>{' '}
                    <span className="text-ink">{c.to}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {result.warnings.length ? (
            <>
              <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">Worth fixing</span>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {result.warnings.map((w) => (
                  <li key={w} className="text-[12.5px] leading-snug text-ink-prose">
                    {w}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {!result.corrections.length && !result.warnings.length ? (
            <span className="text-[12.5px] text-ink-prose">Nothing to flag — this reads well.</span>
          ) : null}

          {/*
            The way back, beside the account of what happened.

            Polish is the one thing here that rewrites words somebody wrote, and
            it can run without being asked — Download triggers it on a stale
            resume. This panel is already what says what it did, so it is where
            the offer to take it back belongs. A toast would be wrong: the panel
            stays until dismissed, and reading sixteen corrections takes longer
            than ten seconds.
          */}
          <div className="mt-4 border-t border-rule pt-3">
            {undoState === 'done' ? (
              <span className="text-[12.5px] text-ink-prose">Put back the way it was.</span>
            ) : undoState === 'gone' ? (
              <span className="text-[12.5px] leading-snug text-flag-ink">
                Too late to undo this pass — something has been edited since, and putting the
                old version back would take that edit with it.
              </span>
            ) : (
              <button
                type="button"
                onClick={revert}
                disabled={undoState === 'undoing'}
                className="text-[12.5px] text-accent transition hover:text-accent-hover disabled:text-ink-ghost"
              >
                {undoState === 'undoing' ? 'Putting it back…' : 'Undo this pass'}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
