import Link from 'next/link';
import RemoveApplication from './RemoveApplication';

export type ApplicationStatus = 'draft' | 'applied' | 'interviewing' | 'offer' | 'rejected' | 'withdrawn';

export interface ApplicationRowData {
  id: string;
  role: string;
  company: string;
  location: string | null;
  matchScore: number | null;
  status: ApplicationStatus;
  /** What this application needs next, and whether it is time-sensitive. */
  next: { label: string; urgent: boolean };
}

const STATUS_TONE: Record<ApplicationStatus, string> = {
  draft: 'bg-ground-band text-ink-prose',
  applied: 'bg-accent-wash text-accent',
  interviewing: 'bg-flag-wash text-flag',
  offer: 'bg-accent-wash text-accent',
  rejected: 'bg-ground-band text-ink-faint',
  withdrawn: 'bg-ground-band text-ink-faint',
};

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  draft: 'Draft',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

export default function ApplicationRow({ row }: { row: ApplicationRowData }) {
  return (
    /*
       The border and the hover move up here from the link.

       The remove button has to sit beside the link rather than inside it — a
       button in an anchor cannot be pressed without following the anchor, and
       the anchor opens the thing being removed. So the row becomes the
       positioned container, and the link keeps its own right-hand padding clear
       of where the button sits.
    */
    <div className="relative border-b border-rule-soft transition last:border-b-0 hover:bg-ground-panel/60">
      <Link
        href={`/applications/${row.id}`}
        className="grid grid-cols-[2.6fr_1fr_1.1fr_1.3fr] items-center gap-4 py-[15px] pl-[22px] pr-12"
      >
        <div className="flex flex-col gap-[3px]">
          <span className="text-sm text-ink">{row.role}</span>
          <span className="text-[12.5px] text-ink-muted">
            {row.company}
            {row.location ? ` · ${row.location}` : ''}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {row.matchScore === null ? (
            <span className="text-[13px] text-ink-ghost">&mdash;</span>
          ) : (
            <>
              <div className="h-[3px] w-[38px] overflow-hidden rounded-sm bg-rule">
                <div
                  className="h-full rounded-sm bg-accent"
                  style={{ width: `${row.matchScore}%` }}
                />
              </div>
              <span className="text-[13px] text-ink-prose">{row.matchScore}%</span>
            </>
          )}
        </div>

        <span className={`justify-self-start rounded-[3px] px-2.5 py-1 text-xs ${STATUS_TONE[row.status]}`}>
          {STATUS_LABEL[row.status]}
        </span>

        <span className={`text-[13px] ${row.next.urgent ? 'text-flag' : 'text-ink-faint'}`}>
          {row.next.label}
        </span>
      </Link>

        <RemoveApplication
          applicationId={row.id}
          label={row.company ? `${row.role} at ${row.company}` : row.role}
        />
    </div>
  );
}
