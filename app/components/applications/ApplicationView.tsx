'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ResumeStructure } from '../../lib/types';
import DownloadPdf from './DownloadPdf';
import StatusPicker from './StatusPicker';
import VersionPicker, { type ResumeVersion } from './VersionPicker';
import type { ApplicationStatus } from './ApplicationRow';
import PdfPreview from './PdfPreview';
import StrengthenPanel from './StrengthenPanel';
import { restoreResumeVersion } from '../../server/actions';

interface Props {
  applicationId: string;
  /** False while an older version is being read. Then the screen is read-only. */
  isLatest: boolean;
  status: ApplicationStatus;
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
  versions: ResumeVersion[];
}

export default function ApplicationView({ applicationId, isLatest, status, posting, resume, versions }: Props) {
  const router = useRouter();
  const [tailoring, setTailoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'review' | 'posting'>('review');
  const [instruction, setInstruction] = useState('');
  const [editing, setEditing] = useState(false);
  const [editsLeft, setEditsLeft] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  async function applyInstruction() {
    if (!instruction.trim() || editing) return;
    setEditing(true);
    setError(null);
    try {
      const response = await fetch(`/api/applications/${applicationId}/instruct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: instruction.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error?.message ?? 'Something went wrong. Please try again.');
        return;
      }
      setEditsLeft(typeof data?.editsLeft === 'number' ? data.editsLeft : null);
      setInstruction('');
      // Inside the transition, so the spinner outlasts the request and a second
      // click cannot land on a screen that has not caught up yet.
      startTransition(() => router.refresh());
    } catch {
      setError('Your internet connection dropped. Please check your connection.');
    } finally {
      setEditing(false);
    }
  }

  /** Resolves false when the tailor failed, so a caller can say so. */
  async function tailor(): Promise<boolean> {
    setTailoring(true);
    setError(null);
    try {
      const response = await fetch(`/api/applications/${applicationId}/tailor`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error?.message ?? 'Something went wrong. Please try again.');
        return false;
      }
      // Inside the transition, so `pending` stays true until the server render
      // actually lands. router.refresh() returns void — it does not resolve
      // when the new page arrives — so clearing the flag straight after it put
      // "Ready when you are." and a live button back on screen while the resume
      // was still being written. A second click there spends a second credit.
      startTransition(() => router.refresh());
      return true;
    } catch {
      setError('Your internet connection dropped. Please check your connection.');
      return false;
    } finally {
      setTailoring(false);
    }
  }

  // One flag for "something is happening", covering both the request and the
  // re-render that follows it.
  const busy = tailoring || pending;

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-ground font-sans text-ink">
      <div className="flex h-[62px] shrink-0 items-center justify-between border-b border-rule bg-ground-surface px-8">
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
            <VersionPicker
              applicationId={applicationId}
              current={resume.version}
              versions={versions}
            />
            <DownloadPdf applicationId={applicationId} version={resume.version} />
            <StatusPicker applicationId={applicationId} status={status} />
          </div>
        ) : null}
      </div>

      {!resume ? (
        <div className="flex flex-grow items-center justify-center px-6 py-16">
          <div className="max-w-[520px] text-center">
            <h1 className="font-serif text-[38px] leading-[1.1]">
              {busy ? 'Rewriting your resume for this one.' : 'Ready when you are.'}
            </h1>
            <p className="mt-4 text-[15.5px] leading-relaxed text-ink-prose">
              {busy
                ? 'It is reading the posting, matching it against everything you have told us, and rewriting your experience around what this role actually asks for.'
                : 'We have the posting. Tailoring rewrites your profile around it — keeping everything true, and putting what matters for this role first.'}
            </p>

            {busy ? (
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

            {posting.requirements.length > 0 && !busy ? (
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
        <div className="grid min-h-0 flex-grow grid-cols-1 overflow-y-auto lg:grid-cols-[320px_minmax(0,1fr)_440px] lg:overflow-hidden">
          {/*
            What happened, at column width instead of a count behind a link.
            This is the app's account of what it did to somebody's career
            history, and it used to be the least readable thing on the screen —
            collapsed, in a 440px rail, next to the controls. The band either
            side of the centred page was three hundred pixels of empty grey.

            Read left, act right: everything here describes, everything on the
            right changes.
          */}
          <div className="order-3 flex min-h-0 flex-col border-t border-rule bg-ground px-5 py-5 lg:order-none lg:border-r lg:border-t-0 lg:overflow-y-auto">
            <span className="text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">
              {resume.log.length
                ? `What changed · ${resume.log.length} ${resume.log.length === 1 ? 'edit' : 'edits'}`
                : 'What changed'}
            </span>
            {resume.log.length ? (
              <div className="mt-4 flex flex-col gap-3">
                {resume.log.map((line, i) => (
                  <div key={i} className="border-l-2 border-rule pl-3">
                    <span className="text-[12.5px] leading-relaxed text-ink-prose">{line}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-[12.5px] leading-relaxed text-ink-muted">
                Nothing has been changed on this version yet.
              </p>
            )}
            <p className="mt-6 border-t border-rule pt-4 text-[12.5px] leading-relaxed text-ink-muted">
              Every date, employer and number is left exactly as your profile has it. Nothing is
              invented to fill a gap.
            </p>
          </div>

          <div className="order-1 flex min-h-0 flex-col items-center bg-ground-band px-8 py-7 lg:order-none lg:overflow-y-auto">
            <div className="mb-4 flex w-full max-w-[600px] items-center justify-between">
              <span className="text-xs text-ink-muted">
                Version {resume.version}
                {!isLatest ? ' · an earlier version' : null}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-[3px] bg-accent-wash px-2.5 py-1 text-[11.5px] text-accent">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                ATS-safe
              </span>
            </div>
            {/* The compiled document, and nothing drawn on it: this is what
                downloads, so a marked-up copy would stop it being a preview. */}
            <PdfPreview applicationId={applicationId} version={resume.version} reloadKey={resume.version} />
          </div>

          <aside className="order-2 flex min-h-0 flex-col border-t border-rule bg-ground-surface lg:order-none lg:border-l lg:border-t-0">
            <div className="flex shrink-0 gap-6 border-b border-rule px-6">
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

            <div className="flex min-h-0 flex-grow flex-col gap-5 overflow-y-auto px-6 py-6">
              {tab === 'review' && !isLatest ? (
                /*
                  Reading an older version is reading only. Not disabled
                  controls — a greyed-out button invites a click and explains
                  nothing — and not silently acting on the newest either, which
                  would apply an edit to a resume that is not on the screen.
                */
                <div className="rounded-md border border-rule bg-ground p-[18px]">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">
                    Looking back
                  </span>
                  <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-prose">
                    You are looking at version {resume.version}. Everything here &mdash; the match,
                    the gaps, what changed &mdash; describes this version, and the download gives
                    you this one. Restore it to work from here.
                  </p>
                  <RestoreVersion
                    applicationId={applicationId}
                    version={resume.version}
                    id={versions.find((v) => v.version === resume.version)?.id ?? ''}
                  />
                </div>
              ) : null}

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

                  {isLatest ? (
                    <StrengthenPanel
                      applicationId={applicationId}
                      missingCount={resume.missingRequirements.length}
                      onImproved={tailor}
                    />
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
                        If you have touched any of these, say so above and it goes in. If not,
                        leave it &mdash; nothing gets invented.
                      </p>
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

            {isLatest ? (
              <div className="flex shrink-0 flex-col gap-3 border-t border-rule px-6 py-4">
                {/*
                  The missing half. Until now the only way to alter a tailored
                  resume was to regenerate it, which spends a credit and rewrites
                  the parts somebody was happy with — so a resume that was
                  ninety-five per cent right could be replaced but not fixed.

                  Free, because a credit means "one application" and charging one
                  to shorten a bullet means nobody ever does it. The examples are
                  there because nobody knows what to type into an empty box.
                */}
                <div className="flex flex-col gap-2.5 rounded-md border border-accent-line bg-accent-tint p-[15px]">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">
                    Change something
                  </span>
                  <textarea
                    rows={2}
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    disabled={editing || busy}
                    placeholder="Make the FraudWatch bullets shorter…"
                    className="w-full resize-none rounded border border-rule-field bg-ground-surface px-3 py-2.5 text-[13.5px] leading-relaxed outline-none transition placeholder:text-ink-ghost focus:border-accent disabled:opacity-60"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {['drop the second bullet', 'lead with the Python work', 'make it fit one page'].map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => setInstruction(example)}
                        disabled={editing || busy}
                        className="rounded-full border border-accent-line bg-ground-surface px-2.5 py-1 text-[11px] text-accent transition hover:border-accent disabled:opacity-50"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11.5px] text-ink-muted">
                      {editsLeft === null ? 'Free · 10 per tailor' : `Free · ${editsLeft} left`}
                    </span>
                    <button
                      type="button"
                      onClick={applyInstruction}
                      disabled={editing || busy || !instruction.trim()}
                      className="rounded bg-accent px-4 py-2 text-[13px] font-medium text-ground transition hover:bg-accent-hover disabled:bg-rule-field disabled:text-ink-ghost"
                    >
                      {editing ? 'Applying…' : 'Apply'}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={tailor}
                  disabled={busy || editing}
                  className="w-full rounded border border-rule-field bg-ground-surface py-3 text-[13.5px] text-ink-prose transition hover:border-accent disabled:opacity-50"
                >
                  {busy ? 'Rewriting…' : 'Tailor again · 1 credit'}
                </button>
                {error ? <p className="text-[13px] text-flag">{error}</p> : null}
              </div>
            ) : error ? (
              <div className="shrink-0 border-t border-rule px-6 py-4">
                <p className="text-[13px] text-flag">{error}</p>
              </div>
            ) : null}
          </aside>
        </div>
      )}
    </main>
  );
}

/**
 * Brings an older version back as the newest.
 *
 * Still a copy forward rather than a rewind, so restoring is itself undoable
 * and nothing in the history is ever lost. That used to be the picker's only
 * action, which made looking indistinguishable from changing; now that browsing
 * is free it is a deliberate step, taken when somebody means it.
 */
function RestoreVersion({
  applicationId,
  version,
  id,
}: {
  applicationId: string;
  version: number;
  id: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!id) return null;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await restoreResumeVersion(applicationId, id);
          router.push(`/applications/${applicationId}`);
          router.refresh();
        })
      }
      className="mt-4 w-full rounded bg-accent px-4 py-2.5 text-[13.5px] font-medium text-ground transition hover:bg-accent-hover disabled:opacity-50"
    >
      {pending ? 'Restoring…' : `Restore version ${version}`}
    </button>
  );
}
