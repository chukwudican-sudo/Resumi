'use client';

import { useState, useTransition } from 'react';
import { removeEntry } from '../../server/actions';
import { formatDates, formatPlace } from '../../lib/entryFormat';
import type { EntryWithBullets } from '../../lib/buildResume';
import EntryEditor, { blankEntry, type EditableEntry, type Kind } from './EntryEditor';

const COPY: Record<Kind, { title: string; blurb: string; add: string; empty: string }> = {
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

export default function EntrySection({
  kind,
  entries,
  onChange,
  onNext,
}: {
  kind: Kind;
  entries: EntryWithBullets[];
  onChange: () => void;
  onNext: () => void;
}) {
  const copy = COPY[kind];
  const mine = entries.filter((e) => e.kind === kind).sort((a, b) => a.orderIndex - b.orderIndex);
  const [editing, setEditing] = useState<EditableEntry | null>(null);
  const [pending, startTransition] = useTransition();

  function open(entry?: EntryWithBullets) {
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
        onCancel={() => setEditing(null)}
        onSaved={() => { setEditing(null); onChange(); }}
      />
    );
  }

  return (
    <div>
      <h1 className="font-serif text-[34px] leading-tight">{copy.title}</h1>
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

          return (
            <div key={entry.id} className="rounded-md border border-rule bg-ground-surface p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[15px] text-ink">{entry.title}</span>
                  <span className="text-[13px] text-ink-muted">
                    {[entry.org, dates, place].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <button type="button" onClick={() => open(entry)} className="text-[13px] text-accent transition hover:text-accent-hover">
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(entry.id)}
                    disabled={pending}
                    className="text-[13px] text-ink-faint transition hover:text-flag disabled:opacity-50"
                  >
                    Remove
                  </button>
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
