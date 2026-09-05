'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { restoreResumeVersion } from '../../server/actions';

export interface ResumeVersion {
  id: string;
  version: number;
  matchScore: number | null;
  createdAt: string;
}

/**
 * Which version of this resume you are looking at, and the earlier ones.
 *
 * Every tailor has always kept the one before it. Nothing showed them, so a
 * second attempt that came out worse than the first was simply a loss.
 *
 * Restoring copies an old version forward as a new one rather than deleting
 * what came after, which makes the restore itself undoable — nobody loses work
 * by pressing the wrong row.
 */
export default function VersionPicker({
  applicationId,
  current,
  versions,
}: {
  applicationId: string;
  current: number;
  versions: ResumeVersion[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // With one version there is no history to offer, so it stays a plain label.
  if (versions.length < 2) {
    return (
      <span className="rounded border border-rule-field px-3 py-2 text-[13px] text-ink-prose">
        Version {current}
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className="flex items-center gap-2 rounded border border-rule-field px-3 py-2 text-[13px] text-ink-prose transition hover:border-accent disabled:opacity-50"
      >
        {pending ? 'Restoring…' : `Version ${current}`}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 top-full z-50 mt-2 max-h-[60vh] w-[280px] overflow-y-auto rounded-lg border border-rule bg-ground-surface shadow-xl shadow-ink/10">
            {versions.map((v) => {
              const isCurrent = v.version === current;
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={isCurrent}
                  onClick={() => {
                    setOpen(false);
                    startTransition(async () => {
                      await restoreResumeVersion(applicationId, v.id);
                      router.refresh();
                    });
                  }}
                  className={`flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left transition ${
                    isCurrent ? 'bg-accent-tint' : 'hover:bg-ground-panel'
                  }`}
                >
                  <span className="flex flex-col">
                    <span className="text-[13.5px] text-ink">
                      Version {v.version}
                      {isCurrent ? <span className="text-ink-faint"> · showing</span> : null}
                    </span>
                    <span className="text-[12px] text-ink-faint">
                      {new Date(v.createdAt).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                      })}
                      {v.matchScore !== null ? ` · ${v.matchScore}/100` : ''}
                    </span>
                  </span>
                  {!isCurrent ? <span className="text-[12.5px] text-accent">Restore</span> : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
