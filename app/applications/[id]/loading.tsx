/**
 * The heaviest read in the app, and until now a completely dead click.
 *
 * Reached by pressing a row on /applications, which then ran `getApplication`,
 * `getLatestResume` and `listResumeVersions` with nothing whatsoever on screen —
 * the single worst "did that work?" moment in the product, and the most common,
 * because opening an application is the thing people do most.
 *
 * Shaped like the page rather than generic: three columns, a header, and a page
 * of resume on the right. A skeleton whose job is to stop the layout jumping has
 * to be the shape of what arrives, or it causes the jump it was added to prevent.
 */
export default function Loading() {
  return (
    <main className="flex h-screen flex-col overflow-hidden bg-ground">
      <span className="sr-only" role="status" aria-live="polite">
        Loading this application
      </span>

      <div className="flex h-[62px] shrink-0 items-center gap-4 border-b border-rule bg-ground-surface px-8" aria-hidden>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2F5D50" strokeWidth="1.5" strokeLinecap="round">
          <path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18" />
        </svg>
        <div className="h-2.5 w-48 animate-pulse rounded bg-rule" />
      </div>

      <div className="grid min-h-0 flex-grow grid-cols-1 lg:grid-cols-[1fr_1.35fr_1.1fr]" aria-hidden>
        <div className="animate-pulse border-r border-rule px-6 py-7">
          <div className="h-2.5 w-1/2 rounded bg-rule" />
          <div className="mt-5 flex flex-col gap-2">
            {[92, 78, 86, 62].map((w, i) => (
              <div key={i} className="h-[7px] rounded bg-rule" style={{ width: `${w}%` }} />
            ))}
          </div>
          <div className="mt-9 h-2.5 w-2/3 rounded bg-rule" />
          <div className="mt-5 flex flex-col gap-2">
            {[88, 74].map((w, i) => (
              <div key={i} className="h-[7px] rounded bg-rule" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>

        <div className="animate-pulse border-r border-rule px-6 py-7">
          <div className="h-2.5 w-2/5 rounded bg-rule" />
          <div className="mt-5 flex flex-col gap-2">
            {[100, 93, 97, 70].map((w, i) => (
              <div key={i} className="h-[7px] rounded bg-rule" style={{ width: `${w}%` }} />
            ))}
          </div>
          <div className="mt-9 h-2.5 w-1/2 rounded bg-rule" />
          <div className="mt-5 flex flex-col gap-2">
            {[96, 84, 90].map((w, i) => (
              <div key={i} className="h-[7px] rounded bg-rule" style={{ width: `${w}%` }} />
            ))}
          </div>
        </div>

        {/* Where the resume lands. A page-shaped block, so it does not resize under you. */}
        <div className="hidden bg-ground-band px-6 py-8 lg:block">
          <div className="aspect-[8.5/11] w-full animate-pulse rounded border border-rule-field bg-rule/60" />
        </div>
      </div>
    </main>
  );
}
