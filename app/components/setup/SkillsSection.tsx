'use client';

import { useState, useTransition } from 'react';
import { saveSkills } from '../../server/actions';

export interface SkillGroup {
  category: string;
  items: string;
}

const SUGGESTED = ['Languages', 'Frameworks', 'Tools', 'Databases', 'Cloud'];

export default function SkillsSection({
  groups,
  onSaved,
}: {
  groups: SkillGroup[];
  onSaved: (next: SkillGroup[]) => void;
}) {
  const [rows, setRows] = useState<SkillGroup[]>(
    groups.length ? groups : [{ category: 'Languages', items: '' }],
  );
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function save() {
    startTransition(async () => {
      const clean = rows.filter((r) => r.items.trim());
      await saveSkills(clean);
      onSaved(clean);
      setSaved(true);
    });
  }

  return (
    <div>
      <h1 className="font-serif text-[34px] leading-tight">Skills</h1>
      <p className="mt-2.5 text-[15px] leading-relaxed text-ink-prose">
        Grouped, comma separated. Tailoring reorders these for each job, so put everything you
        genuinely have &mdash; the ordering is not your problem.
      </p>

      <div className="mt-7 flex flex-col gap-3">
        {rows.map((row, i) => (
          <div key={i} className="flex items-start gap-2">
            <input
              type="text"
              value={row.category}
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...row, category: e.target.value };
                setRows(next);
                setSaved(false);
              }}
              placeholder="Languages"
              className="w-[150px] shrink-0 rounded border border-rule-field bg-ground-surface px-3.5 py-3 text-[14.5px] outline-none transition placeholder:text-ink-ghost focus:border-accent"
            />
            <input
              type="text"
              value={row.items}
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...row, items: e.target.value };
                setRows(next);
                setSaved(false);
              }}
              placeholder="Python, TypeScript, SQL"
              className="w-full rounded border border-rule-field bg-ground-surface px-3.5 py-3 text-[14.5px] outline-none transition placeholder:text-ink-ghost focus:border-accent"
            />
            {rows.length > 1 ? (
              <button
                type="button"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
                className="pt-3 text-ink-ghost transition hover:text-flag"
                aria-label="Remove group"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRows([...rows, { category: '', items: '' }])}
          className="text-[13.5px] text-accent transition hover:text-accent-hover"
        >
          + Add a group
        </button>
        <span className="text-ink-ghost">·</span>
        {SUGGESTED.filter((s) => !rows.some((r) => r.category === s)).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setRows([...rows, { category: s, items: '' }])}
            className="rounded-full border border-rule-field px-2.5 py-1 text-[12px] text-ink-muted transition hover:border-accent hover:text-accent"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between border-t border-rule pt-6">
        <span className="text-[13px] text-ink-faint">{saved ? 'Saved' : 'Not saved yet'}</span>
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded bg-accent px-6 py-3 text-sm font-medium text-ground transition hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
