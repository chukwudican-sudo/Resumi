'use client';

import { useState, useTransition } from 'react';
import { removeEntry, saveEntry } from '../../server/actions';
import type { EntryWithBullets } from '../../lib/buildResume';

type Kind = 'experience' | 'education' | 'project';

const COPY: Record<Kind, { title: string; blurb: string; add: string; empty: string; titleLabel: string; orgLabel: string }> = {
  experience: {
    title: 'Experience',
    blurb: 'Jobs, internships, anything you were paid to do. Most recent first.',
    add: 'Add a job',
    empty: 'No jobs yet.',
    titleLabel: 'Job title',
    orgLabel: 'Company',
  },
  education: {
    title: 'Education',
    blurb: 'Degrees and programmes. Include one you have not finished yet.',
    add: 'Add education',
    empty: 'No education yet.',
    titleLabel: 'Degree',
    orgLabel: 'School',
  },
  project: {
    title: 'Projects',
    blurb: 'Things you built. Especially useful if you are early in your career.',
    add: 'Add a project',
    empty: 'No projects yet.',
    titleLabel: 'Project name',
    orgLabel: 'Where it was built',
  },
};

const BLANK = { id: null as string | null, title: '', org: '', location: '', datesDisplay: '', tech: '', bullets: [''] };

export default function EntrySection({
  kind,
  entries,
  onChange,
  onNext,
}: {
  kind: Kind;
  entries: EntryWithBullets[];
  onChange: (next: EntryWithBullets[]) => void;
  onNext: () => void;
}) {
  const copy = COPY[kind];
  const mine = entries.filter((e) => e.kind === kind).sort((a, b) => a.orderIndex - b.orderIndex);
  const [editing, setEditing] = useState<typeof BLANK | null>(null);
  const [pending, startTransition] = useTransition();

  function open(entry?: EntryWithBullets) {
    setEditing(
      entry
        ? {
            id: entry.id,
            title: entry.title ?? '',
            org: entry.org ?? '',
            location: entry.location ?? '',
            datesDisplay: entry.datesDisplay ?? '',
            tech: entry.tech ?? '',
            bullets: entry.bullets.length ? [...entry.bullets] : [''],
          }
        : { ...BLANK, bullets: [''] },
    );
  }

  function save() {
    if (!editing) return;
    startTransition(async () => {
      await saveEntry({ ...editing, kind });
      setEditing(null);
      // The server has the truth; ask the page to re-read rather than guessing
      // at ids and ordering here.
      onChange(entries);
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await removeEntry(id);
      onChange(entries.filter((e) => e.id !== id));
    });
  }

  if (editing) {
    return (
      <div>
        <h1 className="font-serif text-[34px] leading-tight">
          {editing.id ? 'Edit' : copy.add}
        </h1>

        <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={copy.titleLabel} value={editing.title} onChange={(v) => setEditing({ ...editing, title: v })} />
          <Field label={copy.orgLabel} value={editing.org} onChange={(v) => setEditing({ ...editing, org: v })} />
          <Field
            label="Dates"
            hint="as you would write them"
            value={editing.datesDisplay}
            onChange={(v) => setEditing({ ...editing, datesDisplay: v })}
            placeholder="May – Aug 2025"
          />
          {kind === 'project' ? (
            <Field
              label="Built with"
              optional
              value={editing.tech}
              onChange={(v) => setEditing({ ...editing, tech: v })}
              placeholder="Next.js, TypeScript, Postgres"
            />
          ) : (
            <Field
              label="Location"
              optional
              value={editing.location}
              onChange={(v) => setEditing({ ...editing, location: v })}
              placeholder="Toronto, ON"
            />
          )}
        </div>

        {kind !== 'education' ? (
          <div className="mt-7">
            <span className="text-[13.5px] text-ink-prose">What you did</span>
            <p className="mt-1 text-[13px] text-ink-faint">
              One line each, in your own words. Write them plainly &mdash; tailoring rewrites them
              for each job, and the questions will push for numbers later.
            </p>
            <div className="mt-3 flex flex-col gap-2.5">
              {editing.bullets.map((b, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="pt-3.5 text-ink-ghost">&bull;</span>
                  <textarea
                    rows={2}
                    value={b}
                    onChange={(e) => {
                      const next = [...editing.bullets];
                      next[i] = e.target.value;
                      setEditing({ ...editing, bullets: next });
                    }}
                    placeholder="Rebuilt the payment retry pipeline so failed charges were retried automatically"
                    className="w-full resize-none rounded border border-rule-field bg-ground-surface px-3.5 py-2.5 text-[14.5px] leading-relaxed outline-none transition placeholder:text-ink-ghost focus:border-accent"
                  />
                  {editing.bullets.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setEditing({ ...editing, bullets: editing.bullets.filter((_, j) => j !== i) })}
                      className="pt-3 text-ink-ghost transition hover:text-flag"
                      aria-label="Remove line"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setEditing({ ...editing, bullets: [...editing.bullets, ''] })}
              className="mt-3 text-[13.5px] text-accent transition hover:text-accent-hover"
            >
              + Add another line
            </button>
          </div>
        ) : null}

        <div className="mt-8 flex items-center justify-between border-t border-rule pt-6">
          <button
            type="button"
            onClick={() => setEditing(null)}
            disabled={pending}
            className="text-sm text-ink-muted transition hover:text-ink disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending || !editing.title.trim()}
            className="rounded bg-accent px-6 py-3 text-sm font-medium text-ground transition hover:bg-accent-hover disabled:bg-rule-field disabled:text-ink-ghost"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-serif text-[34px] leading-tight">{copy.title}</h1>
      <p className="mt-2.5 text-[15px] leading-relaxed text-ink-prose">{copy.blurb}</p>

      <div className="mt-7 flex flex-col gap-3">
        {mine.map((entry) => (
          <div key={entry.id} className="rounded-md border border-rule bg-ground-surface p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-[15px] text-ink">{entry.title}</span>
                <span className="text-[13px] text-ink-muted">
                  {[entry.org, entry.datesDisplay].filter(Boolean).join(' · ')}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <button type="button" onClick={() => open(entry)} className="text-[13px] text-accent transition hover:text-accent-hover">
                  Edit
                </button>
                <button type="button" onClick={() => remove(entry.id)} disabled={pending} className="text-[13px] text-ink-faint transition hover:text-flag disabled:opacity-50">
                  Remove
                </button>
              </div>
            </div>
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
        ))}

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

function Field({
  label, value, onChange, placeholder, optional, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  optional?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[13.5px] text-ink-prose">
        {label}{' '}
        {optional ? <span className="text-ink-faint">optional</span> : null}
        {hint ? <span className="text-ink-faint">&mdash; {hint}</span> : null}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-rule-field bg-ground-surface px-4 py-3 text-[15px] outline-none transition placeholder:text-ink-ghost focus:border-accent"
      />
    </label>
  );
}
