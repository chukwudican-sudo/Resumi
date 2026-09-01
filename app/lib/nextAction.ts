/**
 * What an application needs from you next.
 *
 * The applications list shows this instead of "last updated", because a job
 * search is a set of things you owe people rather than a list of things you
 * touched. A date tells you nothing you can act on; "follow up — 8 days" does.
 *
 * Pure, so the wording and the urgency rules are testable without a database.
 */

export interface NextActionInput {
  status: string;
  appliedAt: Date | null;
  followUpDueAt: Date | null;
  closesAt: Date | null;
  hasResume: boolean;
}

export interface NextAction {
  label: string;
  /** Shown in amber. Reserved for things with a deadline attached. */
  urgent: boolean;
}

const DAY = 24 * 60 * 60 * 1000;

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function nextAction(input: NextActionInput, now = new Date()): NextAction {
  // Closed outcomes have nothing owing.
  if (input.status === 'rejected' || input.status === 'withdrawn') {
    return { label: '—', urgent: false };
  }
  if (input.status === 'offer') {
    return { label: 'Offer received', urgent: false };
  }

  if (input.status === 'interviewing') {
    return { label: 'Interviewing', urgent: true };
  }

  if (input.status === 'applied') {
    if (input.followUpDueAt && input.followUpDueAt <= now) {
      const days = input.appliedAt ? daysBetween(input.appliedAt, now) : null;
      return {
        label: days ? `Follow up — ${plural(days, 'day')}` : 'Follow up',
        urgent: true,
      };
    }
    if (input.appliedAt) {
      return { label: `Applied ${plural(daysBetween(input.appliedAt, now), 'day')} ago`, urgent: false };
    }
    return { label: 'Applied', urgent: false };
  }

  // Draft. A closing date is the only thing that makes an unsent application
  // urgent — otherwise it is simply not sent yet, which is not a problem.
  if (input.closesAt) {
    const days = daysBetween(now, input.closesAt);
    if (days < 0) return { label: 'Closed', urgent: false };
    if (days === 0) return { label: 'Closes today', urgent: true };
    return { label: `Closes in ${plural(days, 'day')}`, urgent: days <= 7 };
  }

  return { label: input.hasResume ? 'Not sent' : 'No resume yet', urgent: false };
}
