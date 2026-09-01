import Link from 'next/link';
import AppNav from '../components/AppNav';
import ApplicationRow, { type ApplicationRowData, type ApplicationStatus } from '../components/applications/ApplicationRow';
import EmptyApplications from '../components/applications/EmptyApplications';
import Nudges from '../components/applications/Nudges';
import { nextAction } from '../lib/nextAction';
import { requireUserId } from '../server/auth';
import {
  countApplicationsByStatus,
  getProfile,
  getSkillGaps,
  getUser,
  listApplicationsForDisplay,
} from '../server/db/repository';

/**
 * The centre of the app.
 *
 * A server component: it reads what it needs directly and passes it down, so
 * there is no client cache to invalidate and no loading flash on the page
 * people open most often.
 */
export default async function ApplicationsPage() {
  const userId = await requireUserId();

  const [user, profile, rows, counts, skillGaps] = await Promise.all([
    getUser(userId),
    getProfile(userId),
    listApplicationsForDisplay(userId),
    countApplicationsByStatus(userId),
    getSkillGaps(userId),
  ]);

  const list = Array.from(rows as Iterable<any>);
  const hasProfile = Boolean(profile && !profile.stale);

  const applications: ApplicationRowData[] = list.map((r) => ({
    id: r.id,
    role: r.role ?? 'Untitled role',
    company: r.company ?? 'Unknown company',
    location: r.location,
    matchScore: r.match_score,
    status: r.status as ApplicationStatus,
    next: nextAction({
      status: r.status,
      appliedAt: r.applied_at,
      followUpDueAt: r.follow_up_due_at,
      closesAt: r.closes_at,
      hasResume: r.has_resume,
    }),
  }));

  const total = applications.length;
  const sent = applications.filter((a) => a.status !== 'draft').length;
  const interviewing = applications.filter((a) => a.status === 'interviewing').length;

  const followUps = applications.filter((a) => a.next.urgent && a.status === 'applied');

  return (
    <main className="min-h-screen bg-ground text-ink">
      <AppNav active="applications" credits={user?.credits} />

      {total === 0 ? (
        <EmptyApplications hasProfile={hasProfile} />
      ) : (
        <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-9 py-8">
          <div className="flex items-end justify-between">
            <div className="flex items-baseline gap-7">
              <h1 className="font-serif text-[34px] leading-none">Applications</h1>
              <Counter n={total} label="tracked" />
              <Counter n={sent} label="sent" />
              <Counter n={interviewing} label="interviewing" />
            </div>
            <Link
              href="/applications/new"
              className="flex items-center gap-2 rounded bg-accent px-5 py-2.5 text-sm font-medium text-ground transition hover:bg-accent-hover"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New application
            </Link>
          </div>

          <Nudges skillGaps={skillGaps} followUps={followUps} />

          <div className="overflow-hidden rounded-md border border-rule bg-ground-surface">
            <div className="grid grid-cols-[2.6fr_1fr_1.1fr_1.3fr] gap-4 border-b border-rule-soft bg-ground-panel/50 px-[22px] py-3">
              {['Role', 'Match', 'Status', 'Next'].map((h) => (
                <span key={h} className="text-[10.5px] uppercase tracking-[0.11em] text-ink-faint">
                  {h}
                </span>
              ))}
            </div>
            {applications.map((row) => (
              <ApplicationRow key={row.id} row={row} />
            ))}
          </div>

          <p className="text-[13px] text-ink-faint">
            {counts.draft ? `${counts.draft} not sent yet` : 'Everything here has been sent'}
          </p>
        </div>
      )}
    </main>
  );
}

function Counter({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[15px] text-ink">{n}</span>
      <span className="text-[13px] text-ink-muted">{label}</span>
    </div>
  );
}
