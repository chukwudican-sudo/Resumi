'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/**
 * The offer that appears after something changed.
 *
 * `message` is what happened, in the past tense and naming the thing — "Wealth
 * Manager removed", not "Entry deleted". The person is looking at the gap it
 * left, so the toast's job is to confirm which thing went and hand it back.
 */
export interface UndoOffer {
  message: string;
  undo: () => void | Promise<unknown>;
}

interface UndoApi {
  /** Show an offer. Replaces whatever was showing. */
  offer: (offer: UndoOffer) => void;
  /** Take the offer away without acting on it. Any write that offers nothing calls this. */
  dismiss: () => void;
}

/**
 * A no-op default rather than a throw.
 *
 * Every one of these components is reachable from a test and from a page that
 * has not been wrapped yet, and a missing provider should cost the toast, not
 * the screen. `offer` doing nothing is a change that cannot be taken back —
 * which is exactly where the app already was.
 */
const UndoContext = createContext<UndoApi>({ offer: () => {}, dismiss: () => {} });

export function useUndo(): UndoApi {
  return useContext(UndoContext);
}

/** How long the offer stands. Long enough to notice the gap and react to it. */
const LINGER_MS = 10_000;

/**
 * One offer at a time, and every write replaces or clears it.
 *
 * The alternative — letting offers stack up — is not a nicer version of this,
 * it is a different feature with a different bug. A stale offer reverts the
 * wrong step: clear a summary, type a new one, and an offer still standing from
 * the first change writes the ORIGINAL back, silently throwing away what was
 * just typed. So there is exactly one, it is replaced by the next change, and a
 * change that offers nothing has to dismiss it.
 */
export default function UndoProvider({ children }: { children: React.ReactNode }) {
  const [offer, setOffer] = useState<UndoOffer | null>(null);
  const [running, setRunning] = useState(false);
  /**
   * Set when the undo itself threw.
   *
   * Without this the failure is invisible: the toast closes, nothing comes
   * back, and the person is left believing it worked. Silence is the worst
   * possible answer here, because the whole point of the offer is that it can
   * be trusted.
   */
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setOffer(null);
    setRunning(false);
    setFailed(false);
  }, [clearTimer]);

  const show = useCallback(
    (next: UndoOffer) => {
      clearTimer();
      setRunning(false);
      setFailed(false);
      setOffer(next);
      timer.current = setTimeout(() => setOffer(null), LINGER_MS);
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  // Memoised so the context value stays stable. Every client component in the
  // app reads this, and a fresh object on each render would re-render all of
  // them each time the toast appears or goes away. Both functions are stable in
  // their own right, so this never actually changes.
  const api = useMemo<UndoApi>(() => ({ offer: show, dismiss }), [show, dismiss]);

  async function run() {
    if (!offer || running || failed) return;
    // Guarded because a second press would re-insert the same row: the restore
    // paths write verbatim, so firing twice is a duplicate rather than a no-op.
    setRunning(true);
    clearTimer();
    try {
      await offer.undo();
      setOffer(null);
    } catch (error) {
      console.error('[Resumi9] Undo failed.', error);
      setFailed(true);
      timer.current = setTimeout(() => {
        setOffer(null);
        setFailed(false);
      }, LINGER_MS);
    } finally {
      setRunning(false);
    }
  }

  return (
    <UndoContext.Provider value={api}>
      {children}
      {offer ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-8 z-50 flex justify-center px-4"
        >
          {/*
            Centred. It was moved to the left corner to keep it clear of the
            Continue button underneath, which was solving a problem nobody had
            at the cost of putting the message where the eye is not.
          */}
          <div className="pointer-events-auto flex max-w-[min(30rem,100%)] items-center gap-4 rounded-lg border border-rule bg-ground-surface py-3 pl-4 pr-3 shadow-lg shadow-ink/5">
            <span
              className={`min-w-0 flex-1 truncate text-[13.5px] ${failed ? 'text-flag-ink' : 'text-ink-prose'}`}
            >
              {failed ? 'That did not undo — reload the page to see where things stand.' : offer.message}
            </span>
            {/* The offer goes away once it has failed. Pressing it again would
                repeat whatever went wrong, and it no longer knows what is
                actually in the database. */}
            {!failed ? (
              <button
                type="button"
                onClick={run}
                disabled={running}
                className="shrink-0 rounded px-2.5 py-1 text-[13.5px] font-medium text-accent transition hover:bg-accent-tint disabled:text-ink-ghost"
              >
                {running ? 'Undoing…' : 'Undo'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="shrink-0 rounded p-1 text-ink-faint transition hover:bg-ground-panel hover:text-ink-prose"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M5 5l14 14M19 5L5 19" />
              </svg>
            </button>
          </div>
        </div>
      ) : null}
    </UndoContext.Provider>
  );
}
