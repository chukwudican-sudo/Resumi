'use client';

import { useState } from 'react';

/**
 * Gets the PDF onto someone's machine.
 *
 * Sends an id rather than a document: the server already holds the resume, and
 * asking the browser to send back a rendering of it would mean trusting
 * whatever came back. What returns here is a finished PDF and a filename the
 * server chose, so the name is right without the client knowing the rule.
 */
export default function DownloadPdf({ applicationId }: { applicationId?: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function download() {
    setState('working');
    setMessage(null);
    try {
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(applicationId ? { applicationId } : {}),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setMessage(body?.error ?? `Something went wrong (${response.status}).`);
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
    <div className="flex items-center gap-3">
      {message ? <span className="text-[12.5px] text-flag">{message}</span> : null}
      <button
        type="button"
        onClick={download}
        disabled={state === 'working'}
        className="flex items-center gap-2 rounded bg-accent px-4 py-2 text-[13px] font-medium text-ground transition hover:bg-accent-hover disabled:opacity-50"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
        {state === 'working' ? 'Building…' : 'Download PDF'}
      </button>
    </div>
  );
}
