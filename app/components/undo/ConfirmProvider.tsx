'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/**
 * The question, and the word on the button that answers it.
 *
 * `title` names the thing rather than asking "Are you sure?" in the abstract —
 * the thing being removed is the one fact worth putting in front of somebody
 * who may have clicked by accident. `body` is for what they CANNOT see from
 * where they are standing, which is mostly how much else goes with it.
 */
export interface ConfirmRequest {
  title: string;
  body?: string;
  /** "Remove", "Delete". The button says what it does, never "OK". */
  action: string;
}

type Ask = (request: ConfirmRequest) => Promise<boolean>;

/**
 * Proceeds when there is no provider, rather than throwing or silently
 * refusing. A missing provider should cost the confirmation, not the button —
 * which leaves the app exactly where it was before this existed.
 */
const ConfirmContext = createContext<Ask>(async () => true);

export function useConfirm(): Ask {
  return useContext(ConfirmContext);
}

/**
 * The traditional "Are you sure?" — one dialog, in the middle of the screen.
 *
 * Promise-shaped on purpose. A call site reads `if (!(await ask(...))) return;`
 * and then does what it always did, so the question sits in front of the action
 * without the action having to be turned inside out into callbacks. The
 * alternative — each button growing its own armed state — is what the app had,
 * and it drifted: two deletes were armed, two were not, and nobody could say
 * why.
 *
 * Undo is still the thing that saves you afterwards. This is what stops the
 * misclick that undo would have to save you FROM.
 */
export default function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setRequest(null);
    // Focus goes back to the button that opened this. Without it a keyboard
    // lands at the top of the page after every cancel.
    returnTo.current?.focus?.();
    returnTo.current = null;
  }, []);

  const ask = useCallback<Ask>((next) => {
    returnTo.current = document.activeElement as HTMLElement | null;
    // A second question while one is open answers the first with no. Two of
    // these cannot share the screen, and an abandoned promise never resolves —
    // which leaves the caller's transition pending for the life of the page.
    resolver.current?.(false);
    setRequest(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  // Cancel is what gets focus, not the destructive button. Somebody who lands
  // here by accident and presses Enter should end up where they started.
  useEffect(() => {
    if (request) cancelRef.current?.focus();
  }, [request]);

  useEffect(() => {
    if (!request) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        settle(false);
        return;
      }
      // Two buttons and nothing else, so trapping focus is just bouncing
      // between them. Without this, Tab walks off into the page behind — which
      // is still there, still clickable-looking, and no longer reachable.
      if (e.key === 'Tab') {
        e.preventDefault();
        const target = document.activeElement === cancelRef.current ? actionRef : cancelRef;
        target.current?.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [request, settle]);

  const api = useMemo(() => ask, [ask]);

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      {request ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
          {/* Dimmed rather than blurred, and clicking it is the same as Cancel. */}
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => settle(false)}
            className="absolute inset-0 cursor-default bg-ink/25"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby={request.body ? 'confirm-body' : undefined}
            className="relative w-full max-w-[400px] rounded-lg border border-rule bg-ground-surface p-6 shadow-2xl shadow-ink/20"
          >
            <h2 id="confirm-title" className="font-serif text-[20px] leading-snug">
              {request.title}
            </h2>
            {request.body ? (
              <p id="confirm-body" className="mt-2.5 text-[13.5px] leading-relaxed text-ink-prose">
                {request.body}
              </p>
            ) : null}

            <div className="mt-7 flex justify-end gap-3">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => settle(false)}
                className="rounded border border-rule-field px-4 py-2 text-[13px] text-ink-prose transition hover:border-ink-faint hover:text-ink"
              >
                Cancel
              </button>
              {/*
                Amber, not red. Nothing here is an error — the palette's rule,
                and removing something you meant to remove is not a failure.
              */}
              <button
                ref={actionRef}
                type="button"
                onClick={() => settle(true)}
                className="rounded bg-flag px-4 py-2 text-[13px] font-medium text-ground transition hover:bg-flag-ink"
              >
                {request.action}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}
