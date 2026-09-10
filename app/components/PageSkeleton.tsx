/**
 * What a page looks like while its data is on the way.
 *
 * Shaped like the page it stands in for rather than a spinner, so the layout
 * does not jump when the real thing arrives. Nothing here animates fast: a
 * flashing skeleton on a page that loads in 200ms is worse than no skeleton.
 */
export default function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="px-9 py-8">
      {/*
        The shapes are decoration and stay hidden; the sentence is not. This was
        aria-hidden in its entirety, so a screen reader was told nothing at all
        during a navigation — silence being indistinguishable from a dead click.
      */}
      <span className="sr-only" role="status" aria-live="polite">
        Loading
      </span>
      <div className="animate-pulse" aria-hidden>
        <div className="h-7 w-56 rounded bg-rule" />
        <div className="mt-8 flex flex-col gap-3">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="h-[76px] rounded-md border border-rule bg-ground-surface" />
          ))}
        </div>
      </div>
    </div>
  );
}
