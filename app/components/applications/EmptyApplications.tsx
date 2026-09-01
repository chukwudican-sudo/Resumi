import Link from 'next/link';

/**
 * What you see before the first application exists.
 *
 * The checklist opens on something already done, so the screen reads as
 * progress rather than emptiness. It also names the step nobody builds —
 * marking an application as sent — because that is what starts the follow-up
 * clock and turns this from a resume generator into a job-search tool.
 */
export default function EmptyApplications({ hasProfile }: { hasProfile: boolean }) {
  const steps = [
    { title: 'Build your profile', detail: 'Answer some questions, or upload a resume', done: hasProfile },
    { title: 'Add your first job posting', detail: 'Paste the text or drop in a link', done: false },
    { title: 'Download a tailored resume', detail: 'Check it, then send it', done: false },
    { title: 'Mark it as applied', detail: 'So we can remind you to follow up', done: false },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="flex min-h-[calc(100vh-62px)] items-center justify-center px-9 py-12">
      <div className="grid w-full max-w-[900px] grid-cols-1 items-center gap-16 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <span className="text-[11.5px] uppercase tracking-[0.14em] text-accent">
            {hasProfile ? 'Your profile is ready' : 'Start here'}
          </span>
          <h1 className="mt-4 font-serif text-[50px] leading-[1.06] tracking-[-0.015em]">
            {hasProfile ? (
              <>Now find the <em className="not-italic italic text-accent">first</em> one.</>
            ) : (
              <>Let&rsquo;s build your <em className="not-italic italic text-accent">profile</em>.</>
            )}
          </h1>
          <p className="mt-5 max-w-[400px] text-base leading-relaxed text-ink-prose">
            {hasProfile
              ? 'Paste in a job posting and Resumi rewrites your resume around it. Everything you make stays here — most people end up with thirty or forty.'
              : 'Answer a few questions about your work and we will build a resume profile from your answers. It takes about five minutes and you only do it once.'}
          </p>

          <Link
            href={hasProfile ? '/applications/new' : '/onboarding'}
            className="mt-8 inline-flex items-center gap-2.5 rounded bg-accent px-[26px] py-[15px] text-[15px] font-medium text-ground transition hover:bg-accent-hover"
          >
            {hasProfile ? (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add a job posting
              </>
            ) : (
              'Build my profile'
            )}
          </Link>

          {hasProfile ? (
            <div className="mt-[18px] flex items-center gap-2.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#A8A39B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
                <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
              </svg>
              <span className="text-[13.5px] text-ink-muted">
                A link works too &mdash; we&rsquo;ll read the posting from it
              </span>
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-rule bg-ground-surface p-[26px] shadow-[0_1px_24px_rgba(26,24,21,0.04)]">
          <div className="flex items-baseline justify-between">
            <span className="text-[11.5px] uppercase tracking-[0.12em] text-ink-faint">Getting set up</span>
            <span className="text-[12.5px] text-ink-muted">{doneCount} of {steps.length}</span>
          </div>

          <div className="mt-3 h-[3px] overflow-hidden rounded-sm bg-rule">
            <div
              className="h-full rounded-sm bg-accent transition-[width] duration-500"
              style={{ width: `${(doneCount / steps.length) * 100}%` }}
            />
          </div>

          <div className="mt-5 flex flex-col">
            {steps.map((step) => (
              <div key={step.title} className="flex items-start gap-3 py-3">
                <span
                  className={`mt-[1px] flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full ${
                    step.done ? 'bg-accent' : 'border-[1.5px] border-rule-field bg-ground-surface'
                  }`}
                >
                  {step.done ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  ) : null}
                </span>
                <span className="flex flex-col gap-[3px]">
                  <span className={`text-sm ${step.done ? 'text-ink-muted' : 'text-ink'}`}>{step.title}</span>
                  <span className="text-[13px] leading-snug text-ink-faint">{step.detail}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
