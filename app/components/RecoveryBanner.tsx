'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RecoveryBanner() {
  const router = useRouter();
  // Read once on mount (client-side only) — detects sessions interrupted by
  // a hard page close. Does NOT re-read reactively so the banner never
  // appears during a currently-in-progress background re-tailor.
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('resumi-session');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.tailoring) setShow(true);
    } catch {
      // ignore
    }
  }, []);

  if (!show) return null;

  function dismiss() {
    try {
      const raw = window.localStorage.getItem('resumi-session');
      const parsed = raw ? JSON.parse(raw) : {};
      window.localStorage.setItem(
        'resumi-session',
        JSON.stringify({ ...parsed, tailoring: false, updating: false }),
      );
    } catch {
      // ignore
    }
    setShow(false);
  }

  return (
    <div className="sticky top-0 z-40 flex items-center justify-between gap-4 bg-accent px-6 py-3 text-sm font-medium text-slate-950">
      <span>You have an unfinished tailoring session. Resume?</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            dismiss();
            router.push('/review');
          }}
          className="rounded-full bg-slate-950 px-4 py-1.5 text-white hover:bg-slate-800"
        >
          Resume
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-full border border-slate-950/30 px-4 py-1.5 hover:bg-slate-950/10"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
