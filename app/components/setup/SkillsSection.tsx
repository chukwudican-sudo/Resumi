'use client';

import { useState, useTransition } from 'react';
import { saveSectionContent, saveSkills } from '../../server/actions';
import { joinLevel, levelOptions, splitLevel } from '../../lib/proficiency';

export interface SkillGroup {
  category: string;
  items: string;
}

const SUGGESTED = ['Languages', 'Frameworks', 'Tools', 'Databases', 'Cloud'];

/** Whether this section is the kind where a level picker helps. */
function offersLevels(key: string, label: string): boolean {
  return key === 'languages' || /\blanguages?\b/i.test(label);
}

/**
 * Two boxes per row: a label and what goes with it.
 *
 * Skills is the section this was written for, and it is no longer the only one
 * that shape fits — a Languages section is "English / Native", which is the
 * same two boxes. It used to be hardwired to skills, so once Languages started
 * arriving as label-and-value the rail had two rows opening one form: clicking
 * Languages showed the skills and saved into them.
 */
export default function SkillsSection({
  sectionKey = 'skills',
  label = 'Skills',
  groups,
  onSaved,
  onDirty,
}: {
  /** Which section this is editing. 'skills' saves to facts; anything else to its own row. */
  sectionKey?: string;
  label?: string;
  groups: SkillGroup[];
  onSaved: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const isSkills = sectionKey === 'skills';
  const levels = offersLevels(sectionKey, label);
  // An empty group, not one already named. Pre-filling the box with
  // "Languages" reads as a decision the app made about somebody's skills, and
  // the suggestion chips below already offer it without claiming it.
  const [rows, setRows] = useState<SkillGroup[]>(
    groups.length ? groups : [{ category: '', items: '' }],
  );
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  // Wrapped rather than reported at each call site: there are five ways to edit
  // this list and remembering at each of them is how one gets missed.
  //
  // This called itself instead of setRows, so every keystroke recursed until the
  // stack gave out and no edit ever reached state. The skills section could not
  // be used at all.
  const edit = (next: SkillGroup[]) => {
    setSaved(false);
    onDirty(true);
    setRows(next);
  };

  function save() {
    startTransition(async () => {
      // Skills with no items is an empty heading and worth dropping. A language
      // with no level is not — plenty of resumes list a language and stop, and
      // deleting the row because the second box is blank would be the app
      // discarding something somebody typed.
      const clean = isSkills
        ? rows.filter((r) => r.items.trim())
        : rows.filter((r) => r.category.trim() || r.items.trim());
      // Skills are facts, because the questions and the tailoring both read
      // them as facts. Every other label-and-value section is its own row.
      await (isSkills ? saveSkills(clean) : saveSectionContent(sectionKey, { groups: clean }));
      onSaved();
      setSaved(true);
      onDirty(false);
    });
  }

  return (
    <div>
      <h1 className="font-serif text-[34px] leading-tight">{label}</h1>
      <p className="mt-2.5 text-[15px] leading-relaxed text-ink-prose">
        {isSkills ? (
          <>
            Grouped, comma separated. Tailoring reorders these for each job, so put everything you
            genuinely have &mdash; the ordering is not your problem.
          </>
        ) : levels ? (
          <>The language, how well you speak it, and a certificate if you have one.</>
        ) : (
          <>From your resume. A label on the left, what goes with it on the right.</>
        )}
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
                edit(next);
                setSaved(false);
              }}
              placeholder={levels ? 'English' : 'Languages'}
              className="w-[150px] shrink-0 rounded border border-rule-field bg-ground-surface px-3.5 py-3 text-[14.5px] outline-none transition placeholder:text-ink-ghost focus:border-accent"
            />
            {levels ? (
              // Two controls over one stored string.
              //
              // This was one type-in box with suggestions, and browsers filter
              // suggestions to what is already typed — so an imported "Basic
              // (test entry)" matched none of the six and the list opened
              // empty, which is to say the picker did not work at all on the
              // rows that most needed it. A real picker always opens; anything
              // it cannot express goes in the box beside it.
              <>
                <select
                  value={splitLevel(row.items).level}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...row, items: joinLevel({ level: e.target.value, note: splitLevel(row.items).note }) };
                    edit(next);
                  }}
                  className="w-[190px] shrink-0 rounded border border-rule-field bg-ground-surface px-3 py-3 text-[14.5px] outline-none transition focus:border-accent"
                  aria-label="Level"
                >
                  <option value="">Level</option>
                  {levelOptions(splitLevel(row.items).level).map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={splitLevel(row.items).note}
                  onChange={(e) => {
                    const next = [...rows];
                    next[i] = { ...row, items: joinLevel({ level: splitLevel(row.items).level, note: e.target.value }) };
                    edit(next);
                  }}
                  placeholder="DELF B2 — optional"
                  aria-label="Certificate or note"
                  className="w-full rounded border border-rule-field bg-ground-surface px-3.5 py-3 text-[14.5px] outline-none transition placeholder:text-ink-ghost focus:border-accent"
                />
              </>
            ) : (
              <input
                type="text"
                value={row.items}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...row, items: e.target.value };
                  edit(next);
                  setSaved(false);
                }}
                placeholder="Python, TypeScript, SQL"
                className="w-full rounded border border-rule-field bg-ground-surface px-3.5 py-3 text-[14.5px] outline-none transition placeholder:text-ink-ghost focus:border-accent"
              />
            )}
            {rows.length > 1 ? (
              <button
                type="button"
                onClick={() => edit(rows.filter((_, j) => j !== i))}
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
          onClick={() => edit([...rows, { category: '', items: '' }])}
          className="text-[13.5px] text-accent transition hover:text-accent-hover"
        >
          {levels ? '+ Add a language' : '+ Add a group'}
        </button>
        {/* "Frameworks", "Databases" are skills words. They have no business
            being offered under a Languages section. */}
        {isSkills ? <span className="text-ink-ghost">·</span> : null}
        {(isSkills ? SUGGESTED : []).filter((s) => !rows.some((r) => r.category === s)).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => edit([...rows, { category: s, items: '' }])}
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
