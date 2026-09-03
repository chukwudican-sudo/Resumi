'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { polishMasterResume } from '../../server/actions';

/**
 * Hands the editorial decisions to the model, and shows what it decided.
 *
 * Deliberately not silent. The pass renames and regroups your skills, reorders
 * your sections and may correct a misspelled city — all improvements, and all
 * things you would be entitled to be annoyed about discovering by accident on a
 * resume you had already sent. So it reports back: what it fixed, and what it
 * thinks is still weak.
 */
export default function PolishButton({ stale }: { stale: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    warnings: string[];
    corrections: { from: string; to: string; reason: string }[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      try {
        const outcome = await polishMasterResume();
        setResult({ warnings: outcome.warnings, corrections: outcome.corrections });
        router.refresh();
      } catch {
        setError("That didn't go through. Try again in a moment.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={`flex items-center gap-2 rounded px-4 py-2 text-[13px] transition disabled:opacity-50 ${
          stale
            ? 'bg-accent font-medium text-ground hover:bg-accent-hover'
            : 'border border-rule-field text-ink-prose hover:border-accent hover:text-accent'
        }`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8-4.9-3.6L7.1 18l1.9-5.8L4 8.8h6.1z" />
        </svg>
        {pending ? 'Polishing…' : stale ? 'Polish resume' : 'Polished'}
      </button>

      {error ? <span className="text-[12px] text-flag">{error}</span> : null}

      {result ? (
        <div className="max-w-[320px] rounded-md border border-rule bg-ground-surface p-3.5 text-left">
          {result.corrections.length ? (
            <>
              <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">Corrected</span>
              <ul className="mt-1.5 mb-3 flex flex-col gap-1">
                {result.corrections.map((c) => (
                  <li key={c.from} className="text-[12.5px] leading-snug text-ink-prose">
                    <span className="text-ink-ghost line-through">{c.from}</span>{' '}
                    <span className="text-ink">{c.to}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {result.warnings.length ? (
            <>
              <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">Worth fixing</span>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {result.warnings.map((w) => (
                  <li key={w} className="text-[12.5px] leading-snug text-ink-prose">
                    {w}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {!result.corrections.length && !result.warnings.length ? (
            <span className="text-[12.5px] text-ink-prose">Nothing to flag — this reads well.</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
