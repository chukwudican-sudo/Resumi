export const STORAGE_WARNING_EVENT = 'resumi-storage-warning';
export const STORAGE_UPDATE_EVENT = 'resumi-storage-update';

const APPROX_QUOTA_BYTES = 5 * 1024 * 1024;
const WARNING_THRESHOLD = 0.8;

function dispatchWarning(message: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(STORAGE_WARNING_EVENT, { detail: message }));
}

function estimateUsedBytes(): number {
  if (typeof window === 'undefined') return 0;
  let total = 0;
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    const value = window.localStorage.getItem(key) ?? '';
    total += key.length + value.length;
  }
  return total;
}

export function trySetItem(key: string, value: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    dispatchWarning(
      "You're running low on browser storage. Consider replacing your About Me PDF with a smaller file.",
    );
    return false;
  }

  // Same-tab cross-component sync. Deferred via queueMicrotask so the
  // dispatch always fires AFTER the current React reconciliation cycle —
  // calling setState inside a React setState updater (where trySetItem can
  // be called from the functional form of setPersistedState) would cause
  // React to warn "cannot update component while rendering another."
  queueMicrotask(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(STORAGE_UPDATE_EVENT, { detail: key }));
    }
  });

  if (estimateUsedBytes() / APPROX_QUOTA_BYTES > WARNING_THRESHOLD) {
    dispatchWarning(
      "You're running low on browser storage. Consider replacing your About Me PDF with a smaller file.",
    );
  }

  return true;
}
