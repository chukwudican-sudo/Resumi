'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

/**
 * One screen: the posting, and a button.
 *
 * The three-panel workspace this replaces asked for an About Me PDF and a rules
 * document every time. The profile already holds both, so tailoring needs
 * nothing here but the job — and saying so ("tailoring from your profile · N
 * details") is what makes that obvious rather than merely true.
 */
export default function NewApplicationForm({ detailCount }: { detailCount: number }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!text.trim()) {
      setError('Paste the job posting first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sourceUrl }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error?.message ?? 'Something went wrong. Please try again.');
        return;
      }
      router.push(`/applications/${data.applicationId}`);
    } catch {
      setError('Your internet connection dropped. Please check your connection.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-ground font-sans text-ink">
      <div className="flex h-[62px] items-center justify-between border-b border-rule bg-ground-surface px-8">
        <Link href="/applications" className="flex items-center gap-3.5 text-ink-prose transition hover:text-ink">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span className="text-sm">Applications</span>
        </Link>
      </div>

      <div className="mx-auto flex max-w-[660px] flex-col px-6 py-11">
        <h1 className="font-serif text-[34px] leading-[1.08] sm:text-[40px]">
          What are you applying <em className="text-accent">for</em>?
        </h1>
        <p className="mt-3 text-[15px] text-ink-prose">
          Paste the posting. We&rsquo;ll pull out the company, the role, and what they&rsquo;re asking for.
        </p>

        <div className="mt-7 overflow-hidden rounded-md border border-rule-field bg-ground-surface">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
            placeholder="Paste the job posting here…"
            className="min-h-[220px] w-full resize-none px-5 py-5 text-[14.5px] leading-relaxed text-ink outline-none placeholder:text-ink-ghost disabled:opacity-60"
          />
          <div className="flex items-center gap-2.5 border-t border-rule-soft bg-ground-panel/50 px-4 py-3">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8A8680" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
              <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
            </svg>
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              disabled={busy}
              placeholder="Link to the posting (optional)"
              className="flex-grow bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-ghost"
            />
          </div>
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-md bg-ground-band px-4 py-3.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A8680" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0">
            <path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" />
          </svg>
          <span className="text-[13.5px] leading-relaxed text-ink-prose">
            We keep a copy of this posting. Listings come down within weeks &mdash; you will want it
            back the day before an interview.
          </span>
        </div>

        {error ? <p className="mt-4 text-sm text-flag">{error}</p> : null}

        <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-6">
          <div className="flex items-center gap-2.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2F5D50" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <span className="text-[13.5px] text-ink-prose">
              Tailoring from your profile &middot; {detailCount} {detailCount === 1 ? 'detail' : 'details'}
            </span>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !text.trim()}
            className="rounded bg-accent px-[30px] py-3.5 text-[15px] font-medium text-ground transition hover:bg-accent-hover disabled:bg-rule-field disabled:text-ink-ghost"
          >
            {busy ? 'Reading the posting…' : 'Tailor my resume'}
          </button>
        </div>
      </div>
    </main>
  );
}
