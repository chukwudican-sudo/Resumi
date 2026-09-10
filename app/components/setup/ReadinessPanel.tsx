'use client';

import type { ReadinessIssue } from '../../lib/readiness';

/**
 * How many are shown before the rest are counted instead.
 *
 * There is one blocker per problem per entry, so six jobs missing bullets and
 * dates is twelve lines. In a narrow column that is a wall, and a wall reads as
 * "this is hopeless" rather than as a list of small fixes.
 */
const SHOWN = 6;

/**
 * What stands between this person and a resume.
 *
 * `checkReadiness` has always produced these — four specific instructions for
 * an empty profile, plus one per broken entry — and they were computed on every
 * render and thrown away. They only ever reached a screen through PdfPreview's
 * error branch, and PdfPreview is only mounted once the resume is READY, so in
 * the one state where they mattered the fetch never happened.
 *
 * `ReadinessIssue.section` carried a comment saying "Which part of the form
 * fixes it, so the message can point somewhere" from the day it was written.
 * This is the somewhere.
 *
 * Deliberately no ticks and no count of what is done. The rail is already a
 * to-do list and the bar above already reads "1 of 5 sections" — a second
 * progress indicator here would not even agree with it, since the rail counts
 * five sections including Projects, which is optional, and these are four
 * requirements. Two true numbers that never match is worse than one. A line
 * disappearing is the feedback.
 */
export default function ReadinessPanel({
  blocking,
  onGo,
}: {
  blocking: ReadinessIssue[];
  /** Opens the part of the form that fixes it. */
  onGo: (section: ReadinessIssue['section']) => void;
}) {
  if (!blocking.length) return null;

  const shown = blocking.slice(0, SHOWN);
  const rest = blocking.length - shown.length;

  return (
    <div className="mb-6 flex w-full flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.12em] text-ink-faint">
          Before your resume
        </span>
        <span className="text-[11px] tabular-nums text-ink-muted">
          {blocking.length} {blocking.length === 1 ? 'thing' : 'things'} left
        </span>
      </div>

      <ul className="flex flex-col gap-1.5">
        {shown.map((issue) => (
          // The message, not the section name, because the message IS the
          // instruction — "Add your skills" already says where it goes.
          <li key={`${issue.section}-${issue.message}`}>
            <button
              type="button"
              onClick={() => onGo(issue.section)}
              className="group flex w-full items-start gap-2.5 rounded-md border border-rule bg-ground-surface px-3.5 py-2.5 text-left transition hover:border-accent"
            >
              <span
                aria-hidden="true"
                className="mt-[3px] shrink-0 text-ink-ghost transition group-hover:text-accent"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
              <span className="text-[12.5px] leading-snug text-ink-prose transition group-hover:text-ink">
                {issue.message}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* Counted rather than silently dropped: a list that quietly stops is a
          list you finish and then find you had not. */}
      {rest > 0 ? (
        <span className="text-[11.5px] text-ink-faint">
          and {rest} more {rest === 1 ? 'thing' : 'things'} to fix
        </span>
      ) : null}
    </div>
  );
}
