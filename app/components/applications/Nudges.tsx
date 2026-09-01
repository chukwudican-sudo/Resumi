import Link from 'next/link';
import type { SkillGap } from '../../server/db/repository';
import type { ApplicationRowData } from './ApplicationRow';

/**
 * The two strips that make this a job-search tool rather than a resume generator.
 *
 * Both are built from data already stored, and both tell you something you
 * could not work out yourself without reading every posting you saved.
 */
export default function Nudges({
  skillGaps,
  followUps,
}: {
  skillGaps: SkillGap[];
  followUps: ApplicationRowData[];
}) {
  const gap = skillGaps[0] ?? null;
  const followUp = followUps[0] ?? null;
  if (!gap && !followUp) return null;

  return (
    <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
      {gap ? (
        <Link
          href="/interview"
          className="flex items-start gap-3 rounded-md border border-accent-line bg-accent-tint px-[17px] py-[15px] transition hover:border-accent"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2F5D50" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0">
            <path d="M3 3v18h18" />
            <path d="M18 9l-5 5-3-3-4 4" />
          </svg>
          <span className="flex flex-grow flex-col gap-[3px]">
            <span className="text-[13.5px] text-accent-hover">
              {gap.demand} of your saved jobs ask for {titleCase(gap.requirement)}. Your profile never mentions it.
            </span>
            <span className="text-[12.5px] text-accent">
              If you have used it, one answer puts it on every future resume.
            </span>
          </span>
          <span className="mt-px whitespace-nowrap text-[13px] text-accent">Fix</span>
        </Link>
      ) : null}

      {followUp ? (
        <Link
          href={`/applications/${followUp.id}`}
          className="flex items-start gap-3 rounded-md border border-flag-line bg-flag-bg px-[17px] py-[15px] transition hover:border-flag"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8A6414" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          <span className="flex flex-grow flex-col gap-[3px]">
            <span className="text-[13.5px] text-flag-ink">
              You applied to {followUp.company} {followUp.next.label.replace('Follow up — ', '')} ago.
            </span>
            <span className="text-[12.5px] text-flag">
              A short follow-up now is normal and often works.
            </span>
          </span>
          <span className="mt-px whitespace-nowrap text-[13px] text-flag">Draft one</span>
        </Link>
      ) : null}
    </div>
  );
}

/** Requirements are stored lowercased for counting; they are read as prose. */
function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
