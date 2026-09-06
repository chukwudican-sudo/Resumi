import Link from 'next/link';

/**
 * What Resumi promises and what it asks in return.
 *
 * Kept to the clauses that actually apply to a free tool run by one person.
 * The three that carry weight are further down: the resume is the user's to
 * check before sending, only their own information goes in, and the service can
 * stop. Everything else is here because leaving it out would be worse.
 */
export const metadata = {
  title: 'Terms — Resumi',
  description: 'What Resumi promises, and what it asks of you.',
};

const UPDATED = '5 September 2026';

export default function TermsPage() {
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
        <h1 className="font-serif text-[40px] leading-[1.08]">Terms</h1>
        <p className="mt-4 text-[16.5px] leading-relaxed text-ink-prose">
          Resumi is free, and it is run by one person. This says what you can expect from it and
          what it expects from you. It is short because there is not much to say, and plain because
          terms nobody reads protect nobody.
        </p>
        <p className="mt-3 text-[13px] text-ink-faint">Last updated {UPDATED}</p>

        <Section title="What Resumi is">
          <P>
            A tool that helps you write and format a resume. It is not a career service, a
            recruiter, or an employer, and it does not promise that a resume it produces will get
            you an interview or a job.
          </P>
          <P>Using it means agreeing to what follows. If you do not agree, do not use it.</P>
        </Section>

        <Section title="Your account">
          <P>
            You need an account, and what is on it should be true &mdash; particularly your name and
            your contact details, because those go on your resume.
          </P>
          <P>
            Your sign-in is yours to keep safe. Anything done through your account is treated as
            done by you.
          </P>
          <P>Resumi is not built for children. You should be at least 16 to use it.</P>
        </Section>

        <Section title="What you put in">
          <P>
            <B>Your work stays yours.</B> Nothing you enter becomes Resumi&rsquo;s property.
          </P>
          <P>
            Entering it allows Resumi to store it and to send the parts that are needed to the
            services named in the{' '}
            <A href="/privacy">privacy policy</A>, because that is how the software functions.
            Nothing else is done with it.
          </P>
          <P>
            <B>Only enter information about yourself.</B> Do not upload or paste anyone
            else&rsquo;s resume, employment history, or contact details, and do not enter anything
            you are not free to share &mdash; material covered by an agreement with an employer,
            for instance.
          </P>
        </Section>

        <Section title="What comes out">
          <P>
            <B>The resume is yours.</B> Use it however you like. No credit, no restrictions,
            nothing to ask.
          </P>
          <P>
            <B>Read it before you send it.</B> Resumi uses AI to write and rearrange the words
            describing your work, and AI gets things wrong. It can put something more strongly than
            you meant, imply a result you never claimed, or simply make a mistake. Every resume is
            shown to you before it goes anywhere, and checking that it is accurate is your
            responsibility rather than the software&rsquo;s.
          </P>
          <P>
            This one matters more than it sounds. A resume that overstates what you did is a
            serious problem for you and not for anyone else, and Resumi cannot catch it on your
            behalf &mdash; only you know what actually happened.
          </P>
        </Section>

        <Section title="Fair use">
          <P>
            Each account gets a set number of AI generations a month. The limit exists because every
            generation costs real money.
          </P>
          <P>
            Do not work around it: no scripts, no bulk automation, no extra accounts to multiply the
            allowance, and no using the AI for things that are not resumes.
          </P>
          <P>
            An account doing that, or doing something illegal, can be limited or closed. For
            anything short of obvious abuse, you will be told why first.
          </P>
        </Section>

        <Section title="No charge, and no guarantees">
          <P>Resumi is free. There is nothing to pay and nothing to cancel.</P>
          <P>
            That also means it is offered as it is. It may have bugs, it may be unavailable, and it
            may change. Nothing here promises that it will work perfectly, stay available, or keep
            behaving the way it does today.
          </P>
        </Section>

        <Section title="Where responsibility ends">
          <P>
            Resumi is not responsible for what follows from using it &mdash; a job you did not get,
            a mistake in a resume you sent, or work lost to a failure or a deletion. Keep your own
            copy of anything that matters to you.
          </P>
          <P>
            None of this removes rights the law where you live gives you and does not let you sign
            away.
          </P>
        </Section>

        <Section title="Ending it">
          <P>
            You can stop whenever you like. <B>Delete everything</B> on your account page clears
            your data, and your sign-in is removed separately through the account menu.
          </P>
          <P>
            Resumi can close an account for the reasons above, and the service itself may stop
            running. If it is shutting down for good, notice will appear here and go out by email
            with enough time to take your resumes with you.
          </P>
        </Section>

        <Section title="Changes">
          <P>
            If these terms change, the date at the top changes with them, and continuing to use
            Resumi means accepting the new version. Anything significant will be said plainly rather
            than slipped into a revision.
          </P>
        </Section>

        <Section title="Law">
          <P>These terms are governed by the laws of Ontario, Canada.</P>
        </Section>

        <Section title="Asking about any of this">
          <P>
            Write to <A href="mailto:chukwudi.can@gmail.com">chukwudi.can@gmail.com</A>. Resumi is
            currently run by one person, so the answer comes from someone who knows how it works.
          </P>
        </Section>

        <div className="mt-14 flex items-center gap-5 border-t border-rule pt-7">
          <Link href="/" className="text-[14px] text-accent transition hover:text-accent-hover">
            &larr; Back to Resumi
          </Link>
          <Link href="/privacy" className="text-[14px] text-ink-muted transition hover:text-ink">
            Privacy
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

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="text-accent underline underline-offset-4 transition hover:text-accent-hover"
    >
      {children}
    </a>
  );
}
