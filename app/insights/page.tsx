import Link from 'next/link';
import AppNav from '../components/AppNav';
import { requireUserId } from '../server/auth';
import { countApplicationsByStatus, getSkillGaps, getUser } from '../server/db/repository';

/**
 * What every posting you saved keeps asking for that you never mention.
 *
 * The one thing this app can tell someone that a resume tool normally cannot:
 * it needs both halves — every job they saved and everything they have said
 * about themselves — and both are already here. A single query turns a pile of
 * applications into advice.
 */
export default async function InsightsPage() {
  const userId = await requireUserId();
  const [user, gaps, counts] = await Promise.all([
    getUser(userId),
    getSkillGaps(userId, 2),
    countApplicationsByStatus(userId),
  ]);

  const totalApplications = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <main className="min-h-screen bg-ground font-sans text-ink">
      <AppNav active="insights" credits={user?.credits} />

      <div className="mx-auto max-w-[820px] px-9 py-10">
        <h1 className="font-serif text-[38px] leading-none">Insights</h1>
        <p className="mt-3 text-[15px] text-ink-prose">
          Read across every posting you have saved.
        </p>

        {totalApplications < 2 ? (
          <div className="mt-10 rounded-md border border-rule bg-ground-surface p-8 text-center">
            <h2 className="font-serif text-[24px]">Not enough to read yet</h2>
            <p className="mx-auto mt-3 max-w-[420px] text-[15px] leading-relaxed text-ink-prose">
              Save a few job postings and patterns start showing &mdash; the things employers keep
              asking for that your profile never mentions.
            </p>
            <Link
              href="/applications/new"
              className="mt-6 inline-block rounded bg-accent px-6 py-3 text-sm font-medium text-ground transition hover:bg-accent-hover"
            >
              Add a job posting
            </Link>
          </div>
        ) : gaps.length === 0 ? (
          <div className="mt-10 rounded-md border border-accent-line bg-accent-tint p-8">
            <h2 className="font-serif text-[24px] text-accent-hover">Nothing missing</h2>
            <p className="mt-3 max-w-[460px] text-[15px] leading-relaxed text-accent">
              Across the {totalApplications} postings you have saved, everything they ask for
              repeatedly is already somewhere in your profile.
            </p>
          </div>
        ) : (
          <div className="mt-9">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">
                Asked for repeatedly &middot; missing from your profile
              </span>
              <span className="text-[13px] text-ink-muted">
                across {totalApplications} postings
              </span>
            </div>

            <div className="mt-4 overflow-hidden rounded-md border border-rule bg-ground-surface">
              {gaps.map((gap, i) => (
                <div
                  key={gap.requirement}
                  className={`flex items-center justify-between gap-5 px-5 py-4 ${
                    i > 0 ? 'border-t border-rule-soft' : ''
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-flag-wash">
                      <span className="font-serif text-[15px] text-flag">{gap.demand}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[15px] text-ink">
                        {gap.requirement.charAt(0).toUpperCase() + gap.requirement.slice(1)}
                      </span>
                      <span className="text-[13px] text-ink-muted">
                        Asked for by {gap.demand} of your saved jobs
                      </span>
                    </div>
                  </div>
                  <Link
                    href="/interview"
                    className="shrink-0 whitespace-nowrap rounded border border-rule-field px-4 py-2 text-[13px] text-ink-prose transition hover:border-accent hover:text-accent"
                  >
                    I&rsquo;ve used this
                  </Link>
                </div>
              ))}
            </div>

            <p className="mt-5 text-[13.5px] leading-relaxed text-ink-muted">
              If you have genuinely used one of these, answering a question about it puts it on every
              resume you make from now on. If you have not, leave it &mdash; nothing here gets added
              to your resume unless you say it.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
