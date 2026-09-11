'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * What a crash looks like.
 *
 * Without this, an unhandled error in production is a blank white page — the
 * worst thing a stranger can meet, because it gives them nothing to do and no
 * reason to believe a second attempt would go differently.
 *
 * Deliberately does not show the error. A stack trace tells the person nothing
 * they can act on and can carry internals with it; the server log has the real
 * one, and the digest below is what ties this screen to that line.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Resumi9] Unhandled error:', error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-ground px-6 font-sans text-ink">
      <div className="flex w-full max-w-[440px] flex-col items-start">
        <h1 className="font-serif text-[34px] leading-tight">Something broke.</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-prose">
          Not your fault, and nothing you typed has been lost &mdash; your resume is saved as you
          left it. Trying again often works, because most of these are momentary.
        </p>

        <div className="mt-7 flex items-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded bg-accent px-5 py-3 text-sm font-medium text-ground transition hover:bg-accent-hover"
          >
            Try again
          </button>
          <Link
            href="/applications"
            className="rounded border border-rule-field px-5 py-3 text-sm text-ink-prose transition hover:border-ink-faint"
          >
            Back to your applications
          </Link>
        </div>

        {error.digest ? (
          <p className="mt-8 text-[12px] text-ink-faint">
            If it keeps happening, quote this: {error.digest}
          </p>
        ) : null}
      </div>
    </main>
  );
}
