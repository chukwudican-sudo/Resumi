'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { markApplicationApplied } from '../../server/actions';
import type { ResumeStructure } from '../../lib/types';
import ResumePaper from './ResumePaper';

interface Props {
  applicationId: string;
  status: string;
  posting: {
    company: string | null;
    role: string | null;
    location: string | null;
    description: string | null;
    sourceUrl: string | null;
    requirements: string[];
  };
  resume: {
    structure: ResumeStructure;
    matchScore: number | null;
    missingRequirements: string[];
    log: string[];
    warnings: string[];
    version: number;
  } | null;
}

export default function ApplicationView({ applicationId, status, posting, resume }: Props) {
  const router = useRouter();
  const [tailoring, setTailoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'review' | 'posting'>('review');
  const [pending, startTransition] = useTransition();

  async function tailor() {
    setTailoring(true);
    setError(null);
    try {
      const response = await fetch(`/api/applications/${applicationId}/tailor`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error?.message ?? 'Something went wrong. Please try again.');
        return;
      }
      router.refresh();
    } catch {
      setError('Your internet connection dropped. Please check your connection.');
    } finally {
      setTailoring(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-ground font-sans text-ink">
      <div className="flex h-[62px] items-center justify-between border-b border-rule bg-ground-surface px-8">
        <div className="flex items-center gap-4">
          <Link href="/applications" className="text-ink-prose transition hover:text-ink">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex flex-col">
            <span className="text-sm text-ink">{posting.role ?? 'Untitled role'}</span>
            <span className="text-[12.5px] text-ink-muted">
              {[posting.company, posting.location].filter(Boolean).join(' · ') || 'Unknown company'}
            </span>
          </div>
        </div>

        {resume ? (
          <div className="flex items-center gap-2.5">
            <span className="rounded border border-rule-field px-3 py-2 text-[13px] text-ink-prose">
              Version {resume.version}
            </span>
            {status === 'draft' ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => markApplicationApplied(applicationId).then(() => router.refresh()))}
                className="flex items-center gap-2 rounded border border-rule-field bg-ground-surface px-4 py-2 text-[13px] text-ink transition hover:border-accent disabled:opacity-50"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2F5D50" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                {pending ? 'Marking…' : 'Mark as applied'}
              </button>
            ) : (
              <span className="rounded bg-accent-wash px-3 py-2 text-[13px] text-accent">
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </span>
            )}
          </div>
        ) : null}
      </div>

      {!resume ? (
        <div className="flex flex-grow items-center justify-center px-6 py-16">
          <div className="max-w-[520px] text-center">
            <h1 className="font-serif text-[38px] leading-[1.1]">
              {tailoring ? 'Rewriting your resume for this one.' : 'Ready when you are.'}
            </h1>
            <p className="mt-4 text-[15.5px] leading-relaxed text-ink-prose">
              {tailoring
                ? 'It is reading the posting, matching it against everything you have told us, and rewriting your experience around what this role actually asks for.'
                : 'We have the posting. Tailoring rewrites your profile around it — keeping everything true, and putting what matters for this role first.'}
            </p>

            {tailoring ? (
              <div className="mt-9 flex items-center justify-center gap-3">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-rule border-t-accent" />
                <span className="text-[15px] text-ink-prose">Usually about a minute</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={tailor}
                className="mt-8 rounded bg-accent px-8 py-4 text-[15px] font-medium text-ground transition hover:bg-accent-hover"
              >
                Tailor my resume
              </button>
            )}

            {posting.requirements.length > 0 && !tailoring ? (
              <div className="mt-10 text-left">
                <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">
                  What they ask for
                </span>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {posting.requirements.slice(0, 12).map((r) => (
                    <span key={r} className="rounded-[3px] bg-ground-band px-2.5 py-1 text-xs text-ink-prose">
                      {r}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {error ? <p className="mt-6 text-sm text-flag">{error}</p> : null}
          </div>
        </div>
      ) : (
        <div className="grid flex-grow grid-cols-1 lg:grid-cols-[minmax(0,1fr)_440px]">
          <div className="flex flex-col items-center bg-ground-band px-9 py-7">
            <div className="mb-4 flex w-full max-w-[600px] items-center justify-between">
              <span className="text-xs text-ink-muted">Version {resume.version}</span>
              <span className="inline-flex items-center gap-1.5 rounded-[3px] bg-accent-wash px-2.5 py-1 text-[11.5px] text-accent">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                ATS-safe
              </span>
            </div>
            <ResumePaper structure={resume.structure} />
          </div>

          <aside className="flex flex-col border-t border-rule bg-ground-surface lg:border-l lg:border-t-0">
            <div className="flex gap-6 border-b border-rule px-6">
              {(['review', 'posting'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`py-4 text-[13.5px] ${tab === t ? 'border-b-2 border-accent text-ink' : 'text-ink-muted'}`}
                >
                  {t === 'review' ? 'Review' : 'Job posting'}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-5 overflow-y-auto px-6 py-6">
              {tab === 'review' ? (
                <>
                  {resume.matchScore !== null ? (
                    <div className="rounded-md border border-rule p-[18px]">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">Match</span>
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-serif text-[30px] leading-none">{resume.matchScore}</span>
                          <span className="text-[13px] text-ink-faint">/ 100</span>
                        </div>
                      </div>
                      <div className="mt-3 h-1 overflow-hidden rounded-sm bg-rule">
                        <div className="h-full rounded-sm bg-accent" style={{ width: `${resume.matchScore}%` }} />
                      </div>
                    </div>
                  ) : null}

                  {resume.missingRequirements.length > 0 ? (
                    <div className="rounded-md border border-flag-line bg-flag-bg p-[18px]">
                      <div className="flex items-center gap-2.5">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8A6414" strokeWidth="1.8" strokeLinecap="round">
                          <path d="M12 9v4M12 17h.01" />
                          <path d="M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
                        </svg>
                        <span className="text-[13.5px] text-flag-ink">
                          They ask for {resume.missingRequirements.length}{' '}
                          {resume.missingRequirements.length === 1 ? 'thing' : 'things'} you have not mentioned
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {resume.missingRequirements.map((r) => (
                          <span key={r} className="rounded-[3px] border border-flag-line bg-ground-surface px-2.5 py-1 text-xs text-flag-ink">
                            {r}
                          </span>
                        ))}
                      </div>
                      <p className="mt-3 text-[12.5px] leading-snug text-flag">
                        If you have touched any of these, say so in the questions and it goes in. If
                        not, leave it &mdash; nothing gets invented.
                      </p>
                    </div>
                  ) : null}

                  {resume.log.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">
                        What changed &middot; {resume.log.length} {resume.log.length === 1 ? 'edit' : 'edits'}
                      </span>
                      {resume.log.map((line, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <div className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-ink-ghost" />
                          <span className="text-[13.5px] leading-snug text-ink-prose">{line}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {resume.warnings.length > 0 ? (
                    <div className="flex flex-col gap-2 rounded-md border border-flag-line bg-flag-bg p-4">
                      <span className="text-[11px] uppercase tracking-[0.12em] text-flag">Worth checking</span>
                      {resume.warnings.map((w, i) => (
                        <span key={i} className="text-[13px] leading-snug text-flag-ink">{w}</span>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="flex flex-col gap-4">
                  {posting.sourceUrl ? (
                    <a href={posting.sourceUrl} target="_blank" rel="noreferrer" className="text-[13.5px] text-accent underline">
                      Original listing
                    </a>
                  ) : null}
                  <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-prose">
                    {posting.description ?? 'No description was captured.'}
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-rule px-6 py-4">
              <button
                type="button"
                onClick={tailor}
                disabled={tailoring}
                className="w-full rounded border border-rule-field bg-ground-surface py-3 text-[13.5px] text-ink-prose transition hover:border-accent disabled:opacity-50"
              >
                {tailoring ? 'Rewriting…' : 'Tailor again'}
              </button>
              {error ? <p className="mt-3 text-[13px] text-flag">{error}</p> : null}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
