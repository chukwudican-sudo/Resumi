'use client';

import { useState, useTransition } from 'react';
import { removeEntry } from '../../server/actions';
import { formatDates, formatPlace } from '../../lib/entryFormat';
import { SCORED_KINDS, hasQuantity } from '../../lib/profileStrength';
import { inPrintOrder, type EntryWithBullets } from '../../lib/buildResume';
import EntryEditor, { blankEntry, type EditableEntry, type Kind } from './EntryEditor';
import SectionHeading from './SectionHeading';

interface Copy { title: string; blurb: string; add: string; empty: string }

const COPY: Record<string, Copy> = {
  experience: {
    title: 'Experience',
    blurb: 'Jobs, internships, anything you were paid to do.',
    add: 'Add a job',
    empty: 'No jobs yet.',
  },
  education: {
    title: 'Education',
    blurb: 'Degrees and programmes, including one you have not finished.',
    add: 'Add education',
    empty: 'No education yet.',
  },
  project: {
    title: 'Projects',
    blurb: 'Things you built. Especially worth having if you are early in your career.',
    add: 'Add a project',
    empty: 'No projects yet.',
  },
};

/**
 * Wording for a section the app has no copy written for.
 *
 * A Volunteering section is Experience with a different heading, so it needs no
 * new editor — only a name. Taking that from the section's own label is what
 * keeps a section imported from somebody's resume usable without a code change.
 */
function copyFor(kind: Kind, label?: string): Copy {
  const known = COPY[kind];
  if (known) return known;
  const title = label?.trim() || 'Entries';
  return {
    title,
    blurb: 'From your resume. Add, edit or reorder these the same way as anything else.',
    add: 'Add an entry',
    empty: 'Nothing here yet.',
  };
}

export default function EntrySection({
  kind,
  sectionKey,
  label,
  entries,
  onChange,
  onNext,
  onDirty,
}: {
  kind: Kind;
  /**
   * Which section this is. Not the same as `kind`: Projects is keyed
   * `projects` and files its entries under `project`.
   */
  sectionKey: string;
  /** What this section is called, as the person named it. */
  label?: string;
  entries: EntryWithBullets[];
  onChange: () => void;
  onNext: () => void;
  /** True while an entry is open for editing and its changes are unsaved. */
  onDirty: (dirty: boolean) => void;
}) {
  const copy = copyFor(kind, label);
  // Sorted the way the page prints them, not the way they were added. These
  // used to disagree, so the form showed one order and the PDF beside it
  // showed another.
  const mine = inPrintOrder(entries.filter((e) => e.kind === kind));
  const [editing, setEditing] = useState<EditableEntry | null>(null);
  const [pending, startTransition] = useTransition();

  /**
   * Which entry has been asked about, before it is actually removed.
   *
   * Removing was one click, with no confirmation, no undo and no record — the
   * delete is a hard delete, so afterwards there is nothing to say a job ever
   * existed. Somebody removed one while testing and neither they nor the
   * database could tell later that it had happened; working out where the job
   * went took reading timestamps.
   *
   * Arming rather than a browser confirm(), which is a modal nobody reads and
   * looks nothing like the rest of this page. One at a time, so the armed
   * button is always the one being looked at.
   */
  const [arming, setArming] = useState<string | null>(null);

  function open(entry?: EntryWithBullets) {
    onDirty(true);
    if (!entry) {
      setEditing(blankEntry(kind));
      return;
    }
    setEditing({
      id: entry.id,
      kind,
      title: entry.title ?? '',
      org: entry.org ?? '',
      location: entry.location ?? '',
      datesDisplay: entry.datesDisplay ?? '',
      tech: entry.tech ?? '',
      bullets: entry.bullets.length ? [...entry.bullets] : [''],
      dates: {
        startMonth: entry.startMonth ?? null,
        startYear: entry.startYear ?? null,
        endMonth: entry.endMonth ?? null,
        endYear: entry.endYear ?? null,
        isCurrent: entry.isCurrent ?? false,
      },
      place: {
        city: entry.city ?? null,
        region: entry.region ?? null,
        country: entry.country ?? null,
      },
      url: entry.url ?? '',
      extra: (entry.extra as Record<string, string>) ?? {},
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await removeEntry(id);
      onChange();
    });
  }

  if (editing) {
    return (
      <EntryEditor
        kind={kind}
        entry={editing}
        onCancel={() => { setEditing(null); onDirty(false); }}
        onSaved={() => { setEditing(null); onDirty(false); onChange(); }}
      />
    );
  }

  return (
    <div>
      {/*
        The section's own name, not the copy table's.
        
        This showed `copy.title`, which is a fixed word per kind — so a resume
        whose rail and PDF both said "Technical Projects" had an editor headed
        "Projects", and renaming would have left the old name sitting here. The
        field labels below still come from the table: they describe the boxes,
        not the section.
      */}
      <SectionHeading sectionKey={sectionKey} label={label ?? copy.title} onRenamed={onChange} />
      <p className="mt-2.5 text-[15px] leading-relaxed text-ink-prose">{copy.blurb}</p>

      <div className="mt-7 flex flex-col gap-3">
        {mine.map((entry) => {
          const dates = formatDates(
            {
              startMonth: entry.startMonth ?? null,
              startYear: entry.startYear ?? null,
              endMonth: entry.endMonth ?? null,
              endYear: entry.endYear ?? null,
              isCurrent: entry.isCurrent ?? false,
            },
            kind,
            entry.datesDisplay,
          );
          const place = formatPlace(
            { city: entry.city ?? null, region: entry.region ?? null, country: entry.country ?? null },
            entry.location,
          );

          // Only the entries that carry a number are marked. An entry without
          // one gets nothing at all — no amber, no label, no icon. Unmarked
          // still reads as not-yet-strong at a glance, but nothing here ever
          // tells somebody their job is deficient.
          //
          // Only where the score counts it. A mark on a degree, an award or a
          // certificate reports on something nothing measures — "Credential
          // #1000" was earning one for containing a number.
          const quantified = SCORED_KINDS.has(kind) && (entry.bullets ?? []).some(hasQuantity);


          return (
            <div key={entry.id} className="rounded-md border border-rule bg-ground-surface p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[15px] text-ink">{entry.title}</span>
                  {/* min-w-0 and flex-wrap keep a long org · dates · place
                      string plus the mark from pushing Edit and Remove off the
                      right edge of the 560px column. */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-[13px] text-ink-muted">
                      {[entry.org, dates, place].filter(Boolean).join(' · ')}
                    </span>
                    {quantified ? (
                      <span className="shrink-0 whitespace-nowrap rounded-[3px] bg-accent-wash px-2 py-0.5 text-[11.5px] text-accent">
                        quantified
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {arming === entry.id ? (
                    <>
                      <span className="text-[13px] text-flag-ink">Remove for good?</span>
                      <button
                        type="button"
                        onClick={() => { setArming(null); remove(entry.id); }}
                        disabled={pending}
                        className="text-[13px] font-medium text-flag transition hover:text-flag-ink disabled:opacity-50"
                      >
                        {pending ? 'Removing…' : 'Yes, remove'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setArming(null)}
                        className="text-[13px] text-ink-muted transition hover:text-ink"
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => open(entry)} className="text-[13px] text-accent transition hover:text-accent-hover">
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setArming(entry.id)}
                        disabled={pending}
                        className="text-[13px] text-ink-faint transition hover:text-flag disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>

              {!dates ? (
                <p className="mt-2.5 text-[12.5px] text-flag">
                  No dates yet &mdash; add them so this sits in the right place on the page.
                </p>
              ) : null}

              {entry.bullets.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {entry.bullets.map((b, i) => (
                    <li key={i} className="text-[13.5px] leading-snug text-ink-prose">
                      <span className="text-ink-ghost">&bull; </span>{b}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}

        {mine.length === 0 ? (
          <p className="rounded-md border border-dashed border-rule-field px-5 py-8 text-center text-[14px] text-ink-faint">
            {copy.empty}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => open()}
        className="mt-4 w-full rounded border border-rule-field bg-ground-surface py-3 text-sm text-ink-prose transition hover:border-accent hover:text-accent"
      >
        + {copy.add}
      </button>

      <div className="mt-8 flex justify-end border-t border-rule pt-6">
        <button
          type="button"
          onClick={onNext}
          className="rounded bg-accent px-6 py-3 text-sm font-medium text-ground transition hover:bg-accent-hover"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
