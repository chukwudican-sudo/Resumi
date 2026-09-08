'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { polishMasterResume } from '../../server/actions';

/**
 * Gets the PDF onto someone's machine.
 *
 * Sends an id rather than a document: the server already holds the resume, and
 * asking the browser to send back a rendering of it would mean trusting
 * whatever came back. What returns here is a finished PDF and a filename the
 * server chose, so the name is right without the client knowing the rule.
 */
export default function DownloadPdf({
  applicationId,
  version,
  polishFirst = false,
  disabled = false,
}: {
  applicationId?: string;
  /** Which version to hand over. Omitted means the latest. */
  version?: number;
  /**
   * Polish before handing the file over.
   *
   * Set when the master resume has unpolished edits. The button does not
   * advertise it — polishing is how a resume gets made here, not a separate
   * feature to be opted into — but it does report afterwards, because it now
   * corrects the entries themselves and editing someone's stored data without
   * telling them is not a thing to do quietly.
   */
  polishFirst?: boolean;
  /** Held shut while a form has unsaved changes that a polish would undo. */
  disabled?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<{ message: string }[]>([]);
  const [polishNote, setPolishNote] = useState<string | null>(null);

  async function download() {
    setState('working');
    setMessage(null);
    setBlocking([]);
    setPolishNote(null);
    try {
      if (polishFirst) {
        const outcome = await polishMasterResume();
        const parts = [
          outcome.corrections.length
            ? `${outcome.corrections.length} correction${outcome.corrections.length === 1 ? '' : 's'}`
            : null,
          'skills grouped and sections ordered',
        ].filter(Boolean);
        setPolishNote(`Polished first \u2014 ${parts.join(', ')}.`);
        router.refresh();
      }

      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The version being looked at, not whatever is newest. Without it the
      // download hands over the latest while an older one is on screen, and the
      // filename gives no hint that they differ.
      body: JSON.stringify(applicationId ? { applicationId, version } : {}),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setMessage(body?.error ?? `Something went wrong (${response.status}).`);
        // The server says what is missing; repeating "not finished" without the
        // list would leave someone clicking the same button again.
        setBlocking(Array.isArray(body?.blocking) ? body.blocking : []);
        setState('error');
        return;
      }

      // The filename is the server's to decide — it is the one thing a
      // recruiter sees before opening the file.
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const named = /filename="([^"]+)"/.exec(disposition);
      const blob = await response.blob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = named?.[1] ?? 'Resume.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setState('idle');
    } catch {
      setMessage('Your internet connection dropped. Please check your connection.');
      setState('error');
    }
  }

  return (
    <div className="relative flex items-center gap-3">
      {message && !blocking.length ? <span className="text-[12.5px] text-flag">{message}</span> : null}
      <button
        type="button"
        onClick={download}
        disabled={state === 'working' || disabled}
        className="flex items-center gap-2 rounded bg-accent px-4 py-2 text-[13px] font-medium text-ground transition hover:bg-accent-hover disabled:opacity-50"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
        {state === 'working' ? 'Building…' : 'Download PDF'}
      </button>

      {polishNote && !blocking.length ? (
        <span className="max-w-[220px] text-right text-[12px] leading-snug text-ink-muted">
          {polishNote}
        </span>
      ) : null}

      {blocking.length ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-[360px] rounded-lg border border-flag/40 bg-ground-surface p-4 text-left shadow-xl shadow-ink/10">
          <div className="mb-2 flex items-start justify-between gap-4">
            <span className="text-[11px] uppercase tracking-[0.12em] text-flag">Not ready to send</span>
            <button
              type="button"
              onClick={() => setBlocking([])}
              aria-label="Dismiss"
              className="-mt-0.5 shrink-0 rounded p-1 text-ink-faint transition hover:bg-ground-panel hover:text-ink"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <ul className="flex flex-col gap-1.5">
            {blocking.map((b) => (
              <li key={b.message} className="text-[12.5px] leading-snug text-ink-prose">
                {b.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
