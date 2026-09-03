'use client';

import { useState, useTransition } from 'react';
import { saveEntry, type EntryInput } from '../../server/actions';
import type { DateParts, PlaceParts } from '../../lib/entryFormat';
import DateRange from './DateRange';
import PlaceFields from './PlaceFields';

export type Kind = 'experience' | 'education' | 'project';

export interface EditableEntry extends EntryInput {
  dates: DateParts;
  place: PlaceParts;
  url: string;
  extra: Record<string, string>;
}

export function blankEntry(kind: Kind): EditableEntry {
  return {
    id: null, kind, title: '', org: '', location: '', datesDisplay: '', tech: '',
    bullets: [''],
    dates: { startMonth: null, startYear: null, endMonth: null, endYear: null, isCurrent: false },
    place: { city: null, region: null, country: null },
    url: '',
    extra: {},
  };
}

/** The ones that cover almost everybody; anything else stays free text. */
const CREDENTIALS = [
  'Bachelor of Engineering',
  'Bachelor of Science',
  'Bachelor of Arts',
  'Master of Science',
  'Master of Engineering',
  'Diploma',
  'Certificate',
];

const COPY: Record<Kind, { titleLabel: string; orgLabel: string; titlePlaceholder: string; orgPlaceholder: string }> = {
  experience: {
    titleLabel: 'Job title', orgLabel: 'Company',
    titlePlaceholder: 'Backend Engineering Intern', orgPlaceholder: 'Northbound',
  },
  education: {
    titleLabel: 'Field of study', orgLabel: 'School',
    titlePlaceholder: 'Software Engineering', orgPlaceholder: 'Ontario Tech University',
  },
  project: {
    titleLabel: 'Project name', orgLabel: 'Context',
    titlePlaceholder: 'Resumi', orgPlaceholder: 'Personal project',
  },
};

/**
 * One entry, with the fields that section actually needs.
 *
 * Required is only what a resume genuinely cannot print without — a title, and
 * a year so entries can be ordered. Everything else is marked optional and
 * means it, because a form that calls a field optional and then refuses to save
 * is worse than one that never offered the choice.
 */
export default function EntryEditor({
  kind,
  entry,
  onSaved,
  onCancel,
}: {
  kind: Kind;
  entry: EditableEntry;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const copy = COPY[kind];
  const [draft, setDraft] = useState(entry);
  const [pending, startTransition] = useTransition();

  const canSave = draft.title.trim().length > 0;

  function save() {
    startTransition(async () => {
      await saveEntry({
        ...draft,
        kind,
        bullets: draft.bullets.map((b) => b.trim()).filter(Boolean),
      });
      onSaved();
    });
  }

  const setExtra = (key: string, value: string) =>
    setDraft({ ...draft, extra: { ...draft.extra, [key]: value } });

  return (
    <div>
      <h1 className="font-serif text-[34px] leading-tight">
        {draft.id ? 'Edit' : kind === 'experience' ? 'Add a job' : kind === 'education' ? 'Add education' : 'Add a project'}
      </h1>

      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label={copy.titleLabel}
          value={draft.title}
          onChange={(v) => setDraft({ ...draft, title: v })}
          placeholder={copy.titlePlaceholder}
        />
        <Field
          label={copy.orgLabel}
          optional={kind === 'project'}
          value={draft.org}
          onChange={(v) => setDraft({ ...draft, org: v })}
          placeholder={copy.orgPlaceholder}
        />
      </div>

      <div className="mt-6">
        <DateRange value={draft.dates} kind={kind} onChange={(dates) => setDraft({ ...draft, dates })} />
      </div>

      <div className="mt-6">
        <PlaceFields value={draft.place} onChange={(place) => setDraft({ ...draft, place })} />
      </div>

      {/* Fields that only make sense for one kind. */}
      {kind === 'project' ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Built with" optional
            value={draft.tech}
            onChange={(v) => setDraft({ ...draft, tech: v })}
            placeholder="Next.js, TypeScript, Postgres"
          />
          <Field
            label="Link" optional
            value={draft.url}
            onChange={(v) => setDraft({ ...draft, url: v })}
            placeholder="github.com/you/project"
          />
        </div>
      ) : null}

      {kind === 'education' ? (
        <div className="mt-6">
          <span className="text-[13.5px] text-ink-prose">Credential</span>
          <p className="mt-1 text-[13px] leading-snug text-ink-faint">
            Written out in full on a resume &mdash; &ldquo;Bachelor of Engineering in Software
            Engineering&rdquo;, not &ldquo;Software Engineering&rdquo; on its own.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {CREDENTIALS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setExtra('credential', draft.extra.credential === c ? '' : c)}
                className={`rounded-full border px-3.5 py-1.5 text-[13px] transition ${
                  draft.extra.credential === c
                    ? 'border-accent bg-accent-tint text-accent'
                    : 'border-rule-field text-ink-muted hover:border-ink-faint'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {kind === 'education' ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="GPA" optional
            value={draft.extra.gpa ?? ''}
            onChange={(v) => setExtra('gpa', v)}
            placeholder="3.8 / 4.0"
            hint="only if it helps you"
          />
          <Field
            label="Honours or awards" optional
            value={draft.extra.honours ?? ''}
            onChange={(v) => setExtra('honours', v)}
            placeholder="Dean's List"
          />
        </div>
      ) : null}

      {kind === 'experience' ? (
        <div className="mt-6">
          <span className="text-[13.5px] text-ink-prose">
            Type of role <span className="text-ink-faint">optional</span>
          </span>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {['Internship', 'Full-time', 'Part-time', 'Contract', 'Volunteer'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setExtra('employment', draft.extra.employment === t ? '' : t)}
                className={`rounded-full border px-3.5 py-1.5 text-[13px] transition ${
                  draft.extra.employment === t
                    ? 'border-accent bg-accent-tint text-accent'
                    : 'border-rule-field text-ink-muted hover:border-ink-faint'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-7">
          <span className="text-[13.5px] text-ink-prose">
            {kind === 'education' ? 'Coursework, honours, anything worth naming' : 'What you did'}
          </span>
          <p className="mt-1 text-[13px] leading-snug text-ink-faint">
            {kind === 'education'
              ? 'Relevant coursework is worth listing while you are still studying \u2014 it is often the most relevant thing you have.'
              : 'One line each, in your own words. Write them plainly \u2014 tailoring rewrites them for each job, and the questions push for numbers once you have a posting.'}
          </p>
          <div className="mt-3 flex flex-col gap-2.5">
            {draft.bullets.map((b, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="pt-3.5 text-ink-ghost">&bull;</span>
                <textarea
                  rows={2}
                  value={b}
                  onChange={(e) => {
                    const next = [...draft.bullets];
                    next[i] = e.target.value;
                    setDraft({ ...draft, bullets: next });
                  }}
                  placeholder={
                    kind === 'education'
                      ? 'Relevant Coursework: Data Structures, Algorithms, Operating Systems'
                      : 'Rebuilt the payment retry pipeline so failed charges were retried automatically'
                  }
                  className="w-full resize-none rounded border border-rule-field bg-ground-surface px-3.5 py-2.5 text-[14.5px] leading-relaxed outline-none transition placeholder:text-ink-ghost focus:border-accent"
                />
                {draft.bullets.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, bullets: draft.bullets.filter((_, j) => j !== i) })}
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
            onClick={() => setDraft({ ...draft, bullets: [...draft.bullets, ''] })}
            className="mt-3 text-[13.5px] text-accent transition hover:text-accent-hover"
          >
            + Add another line
          </button>
      </div>

      <div className="mt-8 flex items-center justify-between border-t border-rule pt-6">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="text-sm text-ink-muted transition hover:text-ink disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending || !canSave}
          className="rounded bg-accent px-6 py-3 text-sm font-medium text-ground transition hover:bg-accent-hover disabled:bg-rule-field disabled:text-ink-ghost"
        >
          {pending ? 'Saving…' : 'Save'}
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
        {label} {optional ? <span className="text-ink-faint">optional</span> : null}
        {hint ? <span className="text-ink-faint"> &mdash; {hint}</span> : null}
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
