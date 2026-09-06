import Link from 'next/link';

/**
 * What Resumi does with what people give it.
 *
 * Written from the code rather than from a template: every claim below was
 * checked against the schema and the request paths, because a privacy policy
 * that describes a different product than the one running is worse than none —
 * it is a promise nobody kept.
 */
export const metadata = {
  title: 'Privacy — Resumi',
  description: 'What Resumi stores, who else sees it, and how to delete it.',
};

const UPDATED = '5 September 2026';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-ground font-sans text-ink">
      <div className="flex h-[74px] items-center justify-between border-b border-rule px-6 sm:px-14">
        <Link href="/" className="flex items-center gap-2.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2F5D50" strokeWidth="1.5" strokeLinecap="round">
            <path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18" />
          </svg>
          <span className="text-[12.5px] uppercase tracking-[0.16em] text-ink-prose">Resumi</span>
        </Link>
        <Link href="/sign-in" className="text-sm text-ink-prose transition hover:text-ink">
          Sign in
        </Link>
      </div>

      <article className="mx-auto max-w-[680px] px-6 py-16 sm:px-8">
        <h1 className="font-serif text-[40px] leading-[1.08]">Privacy</h1>
        <p className="mt-4 text-[16.5px] leading-relaxed text-ink-prose">
          Resumi holds your employment history, which is personal in a way that matters. This says
          exactly what is kept, who else sees it, and how to remove it. It describes what the
          software actually does, not what would be convenient to claim.
        </p>
        <p className="mt-3 text-[13px] text-ink-faint">Last updated {UPDATED}</p>

        <Section title="What is stored">
          <P>
            <B>Your account.</B> Your email address and your name. Sign-in itself is handled by
            Clerk &mdash; Resumi never sees or stores a password.
          </P>
          <P>
            <B>Your resume.</B> Everything you type into it: jobs, education, projects, the bullet
            points describing what you did, your skills, your phone number and links, and any rules
            you write about how your resumes should read.
          </P>
          <P>
            <B>Your applications.</B> Job postings you save, the resume written for each one, and
            every earlier version of it, so you can go back.
          </P>
          <P>
            <B>Answers you give to questions.</B> If you use the interview or answer the questions
            offered after tailoring, those answers are kept and reused on later resumes. That is the
            point of asking them.
          </P>
          <P>
            <B>A record of each AI request.</B> How many tokens it used and what it cost. This is
            used to enforce limits and to keep the service from running up a bill. It records the
            size of a request, never its contents.
          </P>
        </Section>

        <Section title="What is not stored">
          <P>
            <B>Files you upload.</B> If you import an existing resume, the file is read once to pull
            out its contents and is not kept. Only the filename and the date remain, so you can see
            where something came from.
          </P>
          <P>
            <B>Payment details.</B> There are none. Resumi does not take payments.
          </P>
          <P>
            <B>Anything about how you browse.</B> There is no analytics, no tracking pixel, no
            advertising, and no third-party script watching what you do on these pages.
          </P>
        </Section>

        <Section title="Who else sees it">
          <P>
            Resumi is a small application built on a few services. Each one sees only the part it
            needs.
          </P>
          <Party name="Clerk" what="Holds your sign-in. Sees your email address and name; never sees your resume." />
          <Party
            name="Supabase"
            what="The database. Everything described above is stored here, on servers in Canada."
          />
          <Party
            name="Anthropic"
            what="Writes and checks your resumes. Receives the parts of your profile needed for the job at hand — your entries and bullets when tailoring, your skills when organising, your text when proofreading — along with the job posting you pasted."
          />
          <Party
            name="Fly.io"
            what="Turns the finished resume into a PDF, on a machine in Toronto. It receives the typeset document and briefly keeps a copy so the same resume is not rebuilt on every view. It is never told whose resume it is."
          />
          <Party name="Vercel" what="Runs the application and serves these pages." />
          <P>
            Nothing is sold, and nothing is shared with anyone else. Each of these companies has its
            own privacy policy governing what it does with what it receives.
          </P>
        </Section>

        <Section title="Deleting it">
          <P>
            There is a <B>Delete everything</B> button on your account page. It removes your resume,
            every entry and bullet, your rules, every application, and every version of every resume
            you have generated. It is immediate and permanent &mdash; nothing is archived, and there
            is no copy to restore from.
          </P>
          <P>
            Your sign-in belongs to Clerk rather than to Resumi, so it is deleted separately, from
            the account menu. Deleting either one does not delete the other.
          </P>
        </Section>

        <Section title="How long things are kept">
          <P>
            Until you delete them. Resumi does not expire old resumes or applications, because
            somebody coming back after six months away expects their history to be where they left
            it.
          </P>
        </Section>

        <Section title="Changes">
          <P>
            If this changes in a way that affects what happens to your data, the date at the top
            changes with it. Anything material will be said plainly rather than buried in a
            revision.
          </P>
        </Section>

        <Section title="Asking about any of this">
          <P>
            Write to{' '}
            <a
              href="mailto:chukwudi.can@gmail.com"
              className="text-accent underline underline-offset-4 transition hover:text-accent-hover"
            >
              chukwudi.can@gmail.com
            </a>
            . Resumi is currently run by one person, so the answer comes from someone who knows how
            it works.
          </P>
        </Section>

        <div className="mt-14 flex items-center gap-5 border-t border-rule pt-7">
          <Link href="/" className="text-[14px] text-accent transition hover:text-accent-hover">
            &larr; Back to Resumi
          </Link>
          <Link href="/terms" className="text-[14px] text-ink-muted transition hover:text-ink">
            Terms
          </Link>
        </div>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-11">
      <h2 className="font-serif text-[25px] leading-tight">{title}</h2>
      <div className="mt-3.5 flex flex-col gap-3.5">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[15.5px] leading-relaxed text-ink-prose">{children}</p>;
}

function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-medium text-ink">{children}</strong>;
}

function Party({ name, what }: { name: string; what: string }) {
  return (
    <div className="flex flex-col gap-1 border-l-2 border-rule pl-4">
      <span className="text-[14.5px] font-medium text-ink">{name}</span>
      <span className="text-[14.5px] leading-relaxed text-ink-prose">{what}</span>
    </div>
  );
}
