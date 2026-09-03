'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The actual PDF, not a drawing of it.
 *
 * Fetched rather than pointed at directly with an iframe src, for two reasons:
 * a failed compile returns JSON, and an iframe would render that as text on the
 * page; and the loading state belongs to us rather than to whatever the browser
 * decides to show while a document is on its way.
 *
 * The previous PDF stays on screen while a new one builds. Blanking the pane on
 * every change makes the page flash and, worse, briefly tells you there is
 * nothing there.
 */
export default function PdfPreview({
  applicationId,
  reloadKey,
}: {
  applicationId?: string;
  /** Change this to rebuild — after a tailor, or after polishing. */
  reloadKey?: string | number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<{ message: string }[]>([]);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState((s) => (s === 'ready' ? 'ready' : 'loading'));
    setError(null);
    setBlocking([]);

    const query = applicationId ? `?applicationId=${encodeURIComponent(applicationId)}` : '';

    fetch(`/api/resume/preview${query}`)
      .then(async (response) => {
        if (cancelled) return;

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          setError(body?.error ?? `Preview unavailable (${response.status}).`);
          setBlocking(Array.isArray(body?.blocking) ? body.blocking : []);
          setState('error');
          return;
        }

        const blob = await response.blob();
        if (cancelled) return;

        const next = URL.createObjectURL(blob);
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = next;
        setUrl(next);
        setState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setError('Your internet connection dropped. Please check your connection.');
        setState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [applicationId, reloadKey]);

  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  if (state === 'error') {
    return (
      <div className="flex w-full max-w-[640px] flex-col items-center gap-3 rounded border border-rule-field bg-ground-surface px-8 py-16 text-center">
        <span className="text-[14px] text-ink">{error}</span>
        {blocking.length ? (
          <ul className="mt-1 flex flex-col gap-1.5 text-left">
            {blocking.map((b) => (
              <li key={b.message} className="text-[13px] leading-snug text-ink-prose">
                &bull; {b.message}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-[640px] flex-grow">
      {url ? (
        <iframe
          // Hides the viewer's own toolbar where the browser honours it. Chrome
          // and Edge do; Firefox and Safari ignore it and show their own.
          src={`${url}#toolbar=0&navpanes=0&view=FitH`}
          title="Your resume"
          className="h-full min-h-[840px] w-full rounded border border-rule-field bg-white shadow-[0_2px_20px_rgba(26,24,21,0.06)]"
        />
      ) : null}

      {state === 'loading' ? (
        <div
          className={`absolute inset-0 flex items-center justify-center rounded ${
            url ? 'bg-ground-band/60' : 'border border-rule-field bg-ground-surface'
          }`}
        >
          <span className="text-[13px] text-ink-muted">
            {url ? 'Rebuilding…' : 'Building your resume…'}
          </span>
        </div>
      ) : null}
    </div>
  );
}
