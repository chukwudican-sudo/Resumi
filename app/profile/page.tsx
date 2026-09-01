import Link from 'next/link';
import AppNav from '../components/AppNav';
import { CAREER_STAGE_LABELS, type CareerStage, type ResumeStructure } from '../lib/types';
import { hasQuantity, unquantifiedEntries } from '../lib/profileStrength';
import { requireUserId } from '../server/auth';
import { getProfile, getUser } from '../server/db/repository';

/**
 * Everything Resumi knows about the person, and the way back in to add more.
 *
 * Entries are flagged quantified or not, because that single distinction is
 * what separates a resume that lands from one that reads like a job
 * description — and it makes the fix obvious rather than abstract.
 */
export default async function ProfilePage() {
  const userId = await requireUserId();
  const [user, profile] = await Promise.all([getUser(userId), getProfile(userId)]);
  const structure = (profile?.resumeStructure ?? null) as ResumeStructure | null;

  if (!structure || !structure.name) {
    return (
      <main className="min-h-screen bg-ground font-sans text-ink">
        <AppNav active="profile" credits={user?.credits} />
        <div className="mx-auto max-w-[560px] px-9 py-24 text-center">
          <h1 className="font-serif text-[36px] leading-tight">No profile yet</h1>
          <p className="mt-4 text-[15.5px] leading-relaxed text-ink-prose">
            Answer a few questions or upload a resume, and everything Resumi knows about you will
            live here.
          </p>
          <Link
            href="/onboarding"
            className="mt-8 inline-block rounded bg-accent px-6 py-3.5 font-medium text-ground transition hover:bg-accent-hover"
          >
            Build my profile
          </Link>
        </div>
      </main>
    );
  }

  const weak = unquantifiedEntries(structure);
  const contact = [structure.contact?.email, structure.contact?.phone, structure.contact?.linkedin]
    .filter(Boolean)
    .join(' · ');

  const sections = [
    {
      title: 'Experience',
      entries: (structure.experience ?? []).map((e) => ({
        title: e.title, org: e.org, dates: e.dates, bullets: e.bullets ?? [],
      })),
    },
    {
      title: 'Projects',
      entries: (structure.projects ?? []).map((p) => ({
        title: p.name, org: p.tech, dates: p.dates, bullets: p.bullets ?? [],
      })),
    },
    {
      title: 'Education',
      entries: (structure.education ?? []).map((e) => ({
        title: e.degree, org: e.school, dates: e.dates, bullets: [] as string[],
      })),
    },
  ].filter((s) => s.entries.length > 0);

  return (
    <main className="min-h-screen bg-ground font-sans text-ink">
      <AppNav active="profile" credits={user?.credits} />

      <div className="mx-auto grid w-full max-w-[1160px] grid-cols-1 gap-8 px-9 py-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-[18px]">
          <div className="flex items-end justify-between">
            <div>
              <h1 className="font-serif text-[38px] leading-none">{structure.name}</h1>
              <p className="mt-2.5 text-sm text-ink-prose">{contact || 'No contact details captured'}</p>
            </div>
            <span className="hidden text-[13px] text-ink-faint sm:block">
              Used by every resume you make
            </span>
          </div>

          {weak.length > 0 ? (
            <div className="flex items-start gap-3.5 rounded-md border border-flag-line bg-flag-bg px-[18px] py-4">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8A6414" strokeWidth="1.7" strokeLinecap="round" className="mt-px shrink-0">
                <path d="M12 9v4M12 17h.01" />
                <path d="M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
              </svg>
              <div className="flex flex-grow flex-col gap-1">
                <span className="text-sm text-flag-ink">
                  {weak.length === 1 ? 'One entry has' : `${weak.length} entries have`} no numbers in {weak.length === 1 ? 'it' : 'them'}
                </span>
                <span className="text-[13px] leading-snug text-flag">
                  A few questions would fix {weak.length === 1 ? 'it' : 'them'}, and every resume after that gets stronger.
                </span>
              </div>
              <Link
                href="/interview"
                className="shrink-0 whitespace-nowrap rounded border border-flag-line bg-ground-surface px-4 py-2 text-[13px] text-flag-ink transition hover:border-flag"
              >
                Answer them
              </Link>
            </div>
          ) : null}

          {sections.map((section) => (
            <section key={section.title} className="overflow-hidden rounded-md border border-rule bg-ground-surface">
              <div className="flex items-center justify-between border-b border-rule-soft bg-ground-panel/50 px-5 py-3">
                <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">{section.title}</span>
              </div>
              <div className="flex flex-col gap-4 px-5 py-4">
                {section.entries.map((entry, i) => {
                  const quantified = entry.bullets.some(hasQuantity);
                  const showFlag = entry.bullets.length > 0;
                  return (
                    <div key={i} className="flex items-start gap-3.5">
                      <div className="flex flex-grow flex-col gap-1">
                        <div className="flex flex-wrap items-baseline gap-2.5">
                          <span className="text-sm text-ink">{entry.title}</span>
                          <span className="text-[12.5px] text-ink-faint">{entry.org}</span>
                        </div>
                        {entry.bullets.length > 0 ? (
                          <span className="text-[13px] leading-snug text-ink-muted">
                            {entry.bullets[0].slice(0, 110)}
                            {entry.bullets[0].length > 110 ? '…' : ''}
                          </span>
                        ) : null}
                      </div>
                      {showFlag ? (
                        <span
                          className={`shrink-0 whitespace-nowrap rounded-[3px] px-2.5 py-1 text-[11.5px] ${
                            quantified ? 'bg-accent-wash text-accent' : 'bg-flag-wash text-flag'
                          }`}
                        >
                          {quantified ? 'quantified' : 'no numbers'}
                        </span>
                      ) : null}
                      <span className="shrink-0 whitespace-nowrap pt-0.5 text-[12.5px] text-ink-ghost">
                        {entry.dates}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <aside className="flex flex-col gap-3.5">
          <div className="rounded-md border border-rule bg-ground-surface p-5">
            <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">Profile strength</span>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-serif text-[40px] leading-none">{profile?.strength ?? 0}</span>
              <span className="text-sm text-ink-faint">/ 100</span>
            </div>
            <div className="mt-3.5 h-1 overflow-hidden rounded-sm bg-rule">
              <div
                className="h-full rounded-sm bg-accent transition-[width] duration-500"
                style={{ width: `${profile?.strength ?? 0}%` }}
              />
            </div>
            <p className="mt-3.5 text-[13px] leading-snug text-ink-muted">
              The stronger this is, the less you edit after every tailor.
            </p>
          </div>

          {user?.stage ? (
            <div className="rounded-md border border-rule bg-ground-surface p-5">
              <span className="text-[11px] uppercase tracking-[0.12em] text-ink-faint">Looking for</span>
              <p className="mt-3 text-sm text-ink">
                {CAREER_STAGE_LABELS[user.stage as CareerStage] ?? user.stage}
              </p>
              {user.targetField ? (
                <p className="mt-1 text-sm text-ink-prose">{user.targetField}</p>
              ) : null}
            </div>
          ) : null}

          <Link
            href="/interview"
            className="rounded bg-accent px-4 py-3 text-center text-sm font-medium text-ground transition hover:bg-accent-hover"
          >
            Add more detail
          </Link>
          <Link
            href="/onboarding"
            className="rounded border border-rule-field bg-ground-surface px-4 py-3 text-center text-sm text-ink-prose transition hover:border-ink-faint"
          >
            Replace with a file
          </Link>
        </aside>
      </div>
    </main>
  );
}
