import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUserId } from './server/auth';

/**
 * The landing page.
 *
 * Public, and the only page a stranger sees. Someone already signed in has no
 * use for a pitch, so they go straight to their applications.
 */
export default async function LandingPage() {
  if (await currentUserId()) redirect('/applications');

  return (
    <main className="min-h-screen bg-ground font-sans text-ink">
      {/* nav */}
      <div className="flex h-[74px] items-center justify-between border-b border-rule px-6 sm:px-14">
        <div className="flex items-center gap-2.5">
          <Mark />
          <span className="text-[13px] uppercase tracking-[0.16em] text-ink-prose">Resumi</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/sign-in" className="text-sm text-ink-prose transition hover:text-ink">
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="rounded bg-accent px-5 py-2.5 text-sm font-medium text-ground transition hover:bg-accent-hover"
          >
            Get started
          </Link>
        </div>
      </div>

      {/* hero */}
      <section className="overflow-hidden px-6 pt-[88px] sm:px-14">
        <div className="mx-auto flex max-w-[900px] flex-col items-center text-center">
          <div className="flex items-center gap-2.5 rounded-full border border-rule-field bg-ground-surface py-1.5 pl-2 pr-3.5">
            <span className="rounded-full bg-accent-wash px-2 py-0.5 text-[11px] uppercase tracking-[0.06em] text-accent">
              New
            </span>
            <span className="text-[13px] text-ink-prose">
              Build your profile by answering questions &mdash; no resume needed
            </span>
          </div>

          <h1 className="mt-7 font-serif text-[46px] leading-[1.02] tracking-[-0.02em] sm:text-[72px]">
            You&rsquo;ll apply to forty jobs.
            <br />
            You&rsquo;ll tailor <em className="text-accent">maybe five</em>.
          </h1>

          <p className="mt-7 max-w-[540px] text-[17px] leading-relaxed text-ink-prose sm:text-lg">
            Resumi rewrites your resume around each posting you paste in &mdash; in about a minute,
            using only what is already true about you.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
            <Link
              href="/sign-up"
              className="rounded bg-accent px-8 py-4 text-[15.5px] font-medium text-ground transition hover:bg-accent-hover"
            >
              Build my profile
            </Link>
            <span className="text-sm text-ink-muted">Free for your first five applications</span>
          </div>
        </div>

        {/* the product, cropped so it pulls you down the page */}
        <div className="mx-auto -mb-px mt-[68px] max-w-[1000px] overflow-hidden rounded-t-lg border border-rule-field bg-ground-surface shadow-[0_-1px_40px_rgba(26,24,21,0.07)]">
          <div className="flex h-12 items-center justify-between border-b border-rule-soft px-[22px]">
            <div className="flex items-center gap-[22px]">
              <span className="text-[11px] uppercase tracking-[0.16em] text-ink-muted">Resumi</span>
              <span className="text-[12.5px] text-ink">Applications</span>
              <span className="text-[12.5px] text-ink-ghost">Profile</span>
            </div>
            <div className="h-[22px] w-[22px] rounded-full bg-accent-wash" />
          </div>

          <div className="p-[22px]">
            <div className="grid grid-cols-[2.4fr_1fr_1fr_1fr] gap-3.5 px-3.5 pb-[11px]">
              {['Role', 'Match', 'Status', 'Updated'].map((h) => (
                <span key={h} className="text-[10px] uppercase tracking-[0.1em] text-ink-faint">
                  {h}
                </span>
              ))}
            </div>
            {PREVIEW.map((r) => (
              <div
                key={r.company}
                className="grid grid-cols-[2.4fr_1fr_1fr_1fr] items-center gap-3.5 border-t border-rule-soft px-3.5 py-[13px]"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] text-ink">{r.role}</span>
                  <span className="text-[11.5px] text-ink-faint">{r.company}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-[3px] w-[34px] overflow-hidden rounded-sm bg-rule">
                    <div className="h-full rounded-sm bg-accent" style={{ width: r.match }} />
                  </div>
                  <span className="text-xs text-ink-prose">{r.match}</span>
                </div>
                <span className={`justify-self-start rounded-[3px] px-2.5 py-[3px] text-[11px] ${r.tone}`}>
                  {r.status}
                </span>
                <span className="text-xs text-ink-faint">{r.updated}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 01 — numbers */}
      <section className="bg-ground-dark px-6 py-[76px] sm:px-14">
        <div className="mx-auto max-w-[1000px]">
          <Eyebrow n="01" label="Why bother" dark />
          <h2 className="mt-[22px] max-w-[680px] font-serif text-[34px] leading-[1.1] text-[#F5F3EF] sm:text-[44px]">
            Tailoring works. Doing it by hand <em className="text-[#93B3A5]">does not scale</em>.
          </h2>

          <div className="mt-14 grid grid-cols-1 border-t border-[#2C312E] sm:grid-cols-3">
            {STATS.map((s, i) => (
              <div
                key={s.figure}
                className={`flex flex-col gap-4 px-0 pt-10 sm:px-[34px] ${i > 0 ? 'sm:border-l sm:border-[#2C312E]' : ''}`}
              >
                <span className="font-serif text-[52px] leading-none text-[#F5F3EF] sm:text-[62px]">
                  {s.figure}
                </span>
                <span className="max-w-[230px] text-sm leading-relaxed text-[#9AA39D]">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 02 — transformation */}
      <section className="px-6 py-24 sm:px-14">
        <div className="mx-auto max-w-[1000px]">
          <Eyebrow n="02" label="What it does" />
          <h2 className="mt-[22px] max-w-[620px] font-serif text-[34px] leading-[1.1] sm:text-[44px]">
            The same summer, written for the job in front of you.
          </h2>

          <div className="mt-[52px] grid grid-cols-1 items-center gap-4 lg:grid-cols-[1fr_44px_1fr] lg:gap-0">
            <div className="flex min-h-[168px] flex-col gap-4 rounded-md border border-rule bg-ground-surface p-7">
              <span className="text-[11px] uppercase tracking-[0.11em] text-ink-faint">
                What you told us
              </span>
              <p className="text-base leading-relaxed text-ink-prose sm:text-[16.5px]">
                Worked on the payments backend at a fintech startup over the summer.
              </p>
            </div>

            <div className="flex items-center justify-center py-2 lg:py-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B5B0A8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="rotate-90 lg:rotate-0">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </div>

            <div className="flex min-h-[168px] flex-col gap-4 rounded-md border border-accent bg-accent-tint p-7">
              <span className="text-[11px] uppercase tracking-[0.11em] text-accent">
                Written for &mdash; Backend Engineer, Shopify
              </span>
              <p className="text-base leading-relaxed text-ink sm:text-[16.5px]">
                Rebuilt a payment retry pipeline in Python and Celery, recovering 12% of charges that
                previously failed outright and removing 90 minutes of daily manual reconciliation.
              </p>
            </div>
          </div>

          <p className="mt-[22px] text-center text-sm text-ink-muted">
            Nothing invented &mdash; it just asked better questions.
          </p>
        </div>
      </section>

      {/* 03 — how it works */}
      <section className="border-y border-rule bg-ground-band px-6 py-[84px] sm:px-14">
        <div className="mx-auto max-w-[1000px]">
          <Eyebrow n="03" label="How it works" />
          <h2 className="mt-[22px] font-serif text-[34px] leading-[1.1] sm:text-[44px]">
            Build it once. Use it forty times.
          </h2>

          <div className="mt-[52px] grid grid-cols-1 gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="flex flex-col gap-3.5 rounded-md border border-rule bg-ground-surface p-[26px]">
                <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-accent-wash">
                  <span className="font-serif text-[17px] text-accent">{s.n}</span>
                </div>
                <span className="text-[17.5px] text-ink">{s.title}</span>
                <span className="text-[15px] leading-relaxed text-ink-prose">{s.body}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 04 — trust */}
      <section className="px-6 py-24 sm:px-14">
        <div className="mx-auto max-w-[1000px]">
          <Eyebrow n="04" label="The part everyone worries about" />
          <div className="mt-[22px] grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-[72px]">
            <div>
              <h2 className="font-serif text-[34px] leading-[1.1] sm:text-[44px]">
                It will not make things <em className="text-accent">up</em> about you.
              </h2>
              <p className="mt-6 text-base leading-[1.7] text-ink-prose sm:text-[16.5px]">
                Every line on your resume traces back to something you actually told it. Anything
                that cannot be traced is flagged for you rather than passed off as fact.
              </p>
              <p className="mt-[18px] text-base leading-[1.7] text-ink-prose sm:text-[16.5px]">
                It will push you for the specifics that make a resume land &mdash; the number, the
                team size, the thing that changed. It will not supply them for you.
              </p>
            </div>

            <div className="flex flex-col gap-5 rounded-md border border-rule bg-ground-surface p-7 shadow-[0_1px_24px_rgba(26,24,21,0.05)]">
              <p className="text-base leading-relaxed text-ink sm:text-[16.5px]">
                &ldquo;Recovered ~12% of charges that previously failed outright.&rdquo;
              </p>
              <div className="h-px bg-rule-soft" />
              <div className="flex flex-col gap-3">
                <span className="text-[11px] uppercase tracking-[0.11em] text-ink-faint">Traced to</span>
                <div className="flex items-start gap-2.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2F5D50" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="mt-[3px] shrink-0">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  <span className="text-sm leading-snug text-ink-prose">
                    Your answer, question 7 &mdash; &ldquo;it recovered around 12% of payments that
                    used to just fail&rdquo;
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* questions */}
      <section className="px-6 pb-[100px] sm:px-14">
        <div className="mx-auto max-w-[860px]">
          <h2 className="font-serif text-[32px] leading-[1.12] sm:text-[40px]">Questions people ask</h2>
          <div className="mt-9 flex flex-col">
            {FAQS.map((f) => (
              <div
                key={f.q}
                className="grid grid-cols-1 gap-3 border-t border-rule py-[26px] md:grid-cols-[300px_minmax(0,1fr)] md:gap-11"
              >
                <span className="text-base leading-snug text-ink">{f.q}</span>
                <span className="text-[15.5px] leading-[1.7] text-ink-prose">{f.a}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* close */}
      <section className="bg-ground-dark px-6 py-24 sm:px-14">
        <div className="mx-auto flex max-w-[1000px] flex-col items-center text-center">
          <h2 className="max-w-[640px] font-serif text-[38px] leading-[1.1] text-[#F5F3EF] sm:text-[52px]">
            Stop rewriting the same resume from scratch.
          </h2>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
            <Link
              href="/sign-up"
              className="rounded bg-[#F5F3EF] px-[34px] py-4 text-[15.5px] font-medium text-ground-dark transition hover:bg-white"
            >
              Build my profile
            </Link>
            <span className="text-sm text-[#8B958F]">Five minutes &middot; no resume required</span>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="px-6 pb-10 pt-[52px] sm:px-14">
        <div className="mx-auto grid max-w-[1000px] grid-cols-2 gap-12 md:grid-cols-[1.6fr_1fr_1fr]">
          <div className="col-span-2 flex flex-col gap-3 md:col-span-1">
            <div className="flex items-center gap-2.5">
              <Mark size={15} />
              <span className="text-[12.5px] uppercase tracking-[0.16em] text-ink-prose">Resumi</span>
            </div>
            <span className="max-w-[300px] text-sm leading-relaxed text-ink-muted">
              A resume that changes for every job you apply to. Built in Canada.
            </span>
          </div>

          <FooterCol title="Product" items={[['Sign in', '/sign-in'], ['Get started', '/sign-up']]} />
          <FooterCol title="Legal" items={[['Privacy', '/privacy'], ['Terms', '/terms']]} />
        </div>

        <div className="mx-auto mt-11 flex max-w-[1000px] items-center justify-between border-t border-rule pt-6">
          <span className="text-[13px] text-ink-faint">&copy; 2026 Resumi</span>
        </div>
      </footer>
    </main>
  );
}

function Mark({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#2F5D50" strokeWidth="1.5" strokeLinecap="round">
      <path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function Eyebrow({ n, label, dark }: { n: string; label: string; dark?: boolean }) {
  return (
    <div className="flex items-baseline gap-3.5">
      <span className={`font-serif text-[15px] ${dark ? 'text-[#6E8073]' : 'text-ink-faint'}`}>{n}</span>
      <span className={`text-[11.5px] uppercase tracking-[0.16em] ${dark ? 'text-[#6E8073]' : 'text-ink-faint'}`}>
        {label}
      </span>
    </div>
  );
}

function FooterCol({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[11px] uppercase tracking-[0.11em] text-ink-faint">{title}</span>
      {items.map(([label, href]) => (
        <Link key={label} href={href} className="text-sm text-ink-prose transition hover:text-ink">
          {label}
        </Link>
      ))}
    </div>
  );
}

const PREVIEW = [
  { role: 'Backend Engineering Intern', company: 'Shopify', match: '86%', status: 'Interviewing', updated: '2d', tone: 'bg-flag-wash text-flag' },
  { role: 'Software Developer Intern', company: 'Wealthsimple', match: '81%', status: 'Applied', updated: '4d', tone: 'bg-accent-wash text-accent' },
  { role: 'Platform Engineering Intern', company: 'Faire', match: '78%', status: 'Applied', updated: '5d', tone: 'bg-accent-wash text-accent' },
  { role: 'Data Engineering Intern', company: 'Ada', match: '74%', status: 'Draft', updated: '1w', tone: 'bg-ground-band text-ink-prose' },
];

const STATS = [
  { figure: '2×', label: 'the interview rate, tailored against generic' },
  { figure: '30–50', label: 'applications in a typical job search' },
  { figure: 'up to 1h', label: 'spent tailoring a single resume by hand' },
];

const STEPS = [
  { n: '1', title: 'Build your profile', body: 'Answer a few questions about your work, or upload a resume you already have. This happens once.' },
  { n: '2', title: 'Paste a job posting', body: 'Drop in the text or a link. Resumi reads it and works out what the role actually wants.' },
  { n: '3', title: 'Get a resume for that job', body: 'A typeset PDF, rewritten around the posting, ready to send. Every one you make is kept.' },
];

const FAQS = [
  {
    q: 'I do not have a resume yet. Is that a problem?',
    a: 'No — that is the case it was built for. Answer questions about what you have done and it writes the resume from your answers. Uploading an existing one is just a shortcut.',
  },
  {
    q: 'Will it make things up about me?',
    a: 'No. Every line traces back to something you told it, and anything that cannot be traced is flagged for you rather than passed off as fact. It will push you for specifics; it will not supply them.',
  },
  {
    q: 'Will the PDF get through applicant tracking systems?',
    a: 'Yes. It is typeset from a single-column LaTeX template with standard section headings and no tables, columns, or graphics — the things that break parsers.',
  },
  {
    q: 'What happens to what I tell it?',
    a: 'It is yours. It is used to write your resumes and nothing else, it is never sold, and you can delete all of it from your account whenever you want.',
  },
];
