'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { STORAGE_UPDATE_EVENT, trySetItem } from '../lib/storage';

export function useLocalStorageState<T>(key: string, initialState: T) {
  const [state, setState] = useState<T>(initialState);
  const hydrated = useRef(false);

  function readFromStorage() {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(key);
    if (raw) {
      try {
        setState(JSON.parse(raw) as T);
      } catch {
        setState(initialState);
      }
    }
  }

  useEffect(() => {
    readFromStorage();
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Pick up writes made by *other* mounted components for this same key
  // within the same tab (see STORAGE_UPDATE_EVENT in lib/storage.ts).
  useEffect(() => {
    function handleUpdate(event: Event) {
      if ((event as CustomEvent<string>).detail === key) {
        readFromStorage();
      }
    }
    window.addEventListener(STORAGE_UPDATE_EVENT, handleUpdate);
    return () => window.removeEventListener(STORAGE_UPDATE_EVENT, handleUpdate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Write to localStorage synchronously on every update (not in a trailing
  // effect) — code that calls this setter and then immediately navigates
  // (e.g. router.push right after setSession) must not race the write.
  const setPersistedState = useCallback(
    (value: T | ((prev: T) => T)) => {
      if (typeof value === 'function') {
        setState((prev) => {
          const next = (value as (prev: T) => T)(prev);
          trySetItem(key, JSON.stringify(next));
          return next;
        });
      } else {
        trySetItem(key, JSON.stringify(value));
        setState(value);
      }
    },
    [key],
  );

  return [state, setPersistedState] as const;
}
