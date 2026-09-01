import Link from 'next/link';

/**
 * The page around Clerk's form.
 *
 * The heading, the reassurance and the frame are ours; only the fields come
 * from Clerk. That keeps the one screen where someone decides whether to trust
 * us with their work history looking like the product they just read about.
 */
export default function AuthFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main
      className="flex min-h-screen flex-col"
      style={{ background: '#FBFAF8', color: '#1A1815' }}
    >
      <div className="flex h-[74px] items-center px-6 sm:px-14">
        <Link href="/" className="flex items-center gap-2.5">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2F5D50" strokeWidth="1.5" strokeLinecap="round">
            <path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18" />
          </svg>
          <span className="text-[13px] uppercase tracking-[0.16em]" style={{ color: '#57544E' }}>
            Resumi
          </span>
        </Link>
      </div>

      <div className="flex flex-grow items-center justify-center px-6 py-10">
        <div className="w-full max-w-[380px]">
          <h1
            className="text-[40px] leading-[1.12]"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400 }}
          >
            {title}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed" style={{ color: '#57544E' }}>
            {subtitle}
          </p>

          <div className="mt-8">{children}</div>

          <p className="mt-7 text-[12.5px] leading-relaxed" style={{ color: '#9A9690' }}>
            Your resume and answers are yours &mdash; you can delete all of it at any time.
          </p>
        </div>
      </div>
    </main>
  );
}
