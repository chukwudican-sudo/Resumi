'use client';

import { useEffect, useRef } from 'react';

/**
 * Escape closes it.
 *
 * The most traditional gesture there is for "get me out of this", and the app
 * answered it five different ways: the confirm dialog and the section catalogue
 * honoured it, the rename field honoured it, the version and status dropdowns
 * closed on a click elsewhere but not on Escape, and the polish result and the
 * download blocker could only be dismissed by finding a small × in a corner.
 *
 * Bound on `document` only while the thing is open — a listener left attached
 * for the life of the page runs on every keystroke in the app to decide it has
 * nothing to do.
 *
 * The callback is held in a ref so the effect does not re-bind on every render.
 * Passing an inline arrow is then free, which is what makes this worth using at
 * every call site rather than only the careful ones.
 */
export function useEscape(active: boolean, onEscape: () => void) {
  const handler = useRef(onEscape);
  handler.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      handler.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active]);
}
