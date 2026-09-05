import Link from 'next/link';

/** A page that is not there. Reached by an old link, or a typed URL. */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ground px-6 font-sans text-ink">
      <div className="flex w-full max-w-[440px] flex-col items-start">
        <h1 className="font-serif text-[34px] leading-tight">That page isn&rsquo;t here.</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-prose">
          It may have moved, or the link may be older than the page it points at.
        </p>
        <Link
          href="/applications"
          className="mt-7 rounded bg-accent px-5 py-3 text-sm font-medium text-ground transition hover:bg-accent-hover"
        >
          Back to your applications
        </Link>
      </div>
    </main>
  );
}
