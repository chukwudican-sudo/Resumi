'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setApplicationStatus } from '../../server/actions';
import type { ApplicationStatus } from './ApplicationRow';

/**
 * Where this application stands.
 *
 * A menu rather than a single "mark as applied" button, because an application
 * is not a switch — it moves through states, sometimes backwards, and the app
 * already knows what to say about each one. Only "applied" was ever reachable,
 * so everything it knew about interviews, offers and rejections was unreachable
 * with it.
 */
const OPTIONS: { value: ApplicationStatus; label: string; hint: string }[] = [
  { value: 'draft', label: 'Draft', hint: 'Not sent yet' },
  { value: 'applied', label: 'Applied', hint: 'Sent — starts the follow-up clock' },
  { value: 'interviewing', label: 'Interviewing', hint: 'They replied' },
  { value: 'offer', label: 'Offer', hint: 'They said yes' },
  { value: 'rejected', label: 'Rejected', hint: 'They said no' },
  { value: 'withdrawn', label: 'Withdrawn', hint: 'You stepped away' },
];

export default function StatusPicker({
  applicationId,
  status,
}: {
  applicationId: string;
  status: ApplicationStatus;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const current = OPTIONS.find((o) => o.value === status) ?? OPTIONS[0];

  function choose(next: ApplicationStatus) {
    setOpen(false);
    if (next === status) return;
    startTransition(async () => {
      await setApplicationStatus(applicationId, next);
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className="flex items-center gap-2 rounded border border-rule-field bg-ground-surface px-4 py-2 text-[13px] text-ink transition hover:border-accent disabled:opacity-50"
      >
        {pending ? 'Saving…' : current.label}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <>
          {/* Closes on a click anywhere else, without trapping the page. */}
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 top-full z-50 mt-2 w-[260px] overflow-hidden rounded-lg border border-rule bg-ground-surface shadow-xl shadow-ink/10">
            {OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => choose(option.value)}
                className={`flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left transition hover:bg-ground-panel ${
                  option.value === status ? 'bg-accent-tint' : ''
                }`}
              >
                <span className="text-[13.5px] text-ink">{option.label}</span>
                <span className="text-[12px] text-ink-faint">{option.hint}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
