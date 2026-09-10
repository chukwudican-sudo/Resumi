'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { saveSectionContent } from '../../server/actions';
import { useUndo } from '../undo/UndoProvider';
import SectionHeading from './SectionHeading';

/**
 * A section that is a plain list of one-line items.
 *
 * Certifications, awards, languages, interests. Each line prints as its own
 * bullet, which is why they are stored in order rather than as facts: a
 * certifications list read back in an arbitrary order would put the AWS one
 * under the first-aid one on somebody's resume.
 */
export default function ListSection({
  sectionKey,
  label,
  items,
  onSaved,
  onDirty,
}: {
  sectionKey: string;
  label: string;
  items: string[];
  onSaved: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [rows, setRows] = useState<string[]>(items.length ? items : ['']);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const { offer, dismiss } = useUndo();

  // The list as the database holds it. See ProseSection for why this is a ref
  // and not the prop: the prop lags a save by one refresh, and an offer built
  // from a lagging value reverts two steps instead of one.
  //
  // Compared by VALUE, not by identity. `items` is built fresh on every render
  // of the page above, so a dependency on the array itself would re-run this on
  // every keystroke — putting the pre-save value back into the ref moments
  // after the save had moved it on, which is the two-step revert all over again.
  const stored = useRef(items);
  const itemsKey = JSON.stringify(items);
  useEffect(() => { stored.current = items; }, [itemsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Wrapped rather than reported at each call site: there are four ways to edit
  // this list, and remembering at each of them is how one gets missed.
  const edit = (next: string[]) => {
    // Typing makes the offer above stale — "Skills saved · Undo" standing while
    // new words go in would revert the save AND throw the new words away. One
    // offer, and it belongs to the last thing that happened.
    dismiss();
    setSaved(false);
    onDirty(true);
    setRows(next);
  };

  // `edit` without the dismiss — see SkillsSection.
  const editWith = (fn: (prev: string[]) => string[]) => {
    setSaved(false);
    onDirty(true);
    setRows(fn);
  };

  // Same as SkillsSection: the line only leaves the form until Save, but a line
  // deleted by accident is still a line you have to remember and retype. And
  // the one line goes back, not the whole list — see SkillsSection.removeRow.
  function removeRow(i: number) {
    const line = rows[i];
    edit(rows.filter((_, j) => j !== i));
    offer({
      message: line.trim() ? `${line.trim()} removed.` : 'Empty line removed.',
      undo: () => editWith((prev) => [...prev.slice(0, i), line, ...prev.slice(i)]),
    });
  }

  function save() {
    const before = stored.current;
    stored.current = rows;
    startTransition(async () => {
      await saveSectionContent(sectionKey, { items: rows });
      onDirty(false);
      setSaved(true);
      onSaved();
      offer({
        message: `${label} saved.`,
        undo: async () => {
          stored.current = before;
          setRows(before.length ? before : ['']);
          await saveSectionContent(sectionKey, { items: before });
          onSaved();
        },
      });
    });
  }

  return (
    <div>
      <SectionHeading sectionKey={sectionKey} label={label} onRenamed={onSaved} />
      <p className="mt-2.5 text-[15px] leading-relaxed text-ink-prose">
        One per line, in the order they should appear. Put the ones worth reading first &mdash;
        the last few on a list like this are rarely read at all.
      </p>

      <div className="mt-7 flex flex-col gap-2.5">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={row}
              onChange={(e) => edit(rows.map((r, j) => (j === i ? e.target.value : r)))}
              placeholder="AWS Certified Solutions Architect &ndash; Associate"
              className="min-w-0 flex-grow rounded border border-rule-field bg-ground-surface px-3.5 py-2.5 text-[15px] text-ink outline-none transition focus:border-accent"
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              aria-label={`Remove line ${i + 1}`}
              className="shrink-0 rounded p-2 text-ink-faint transition hover:bg-ground-panel hover:text-ink"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => edit([...rows, ''])}
        className="mt-3 text-[13px] text-accent transition hover:text-accent-hover hover:underline hover:underline-offset-2"
      >
        + Add another
      </button>

      <div className="mt-8 flex items-center justify-end gap-3">
        {saved && !pending ? <span className="text-[12.5px] text-ink-faint">Saved</span> : null}
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded bg-accent px-5 py-2.5 text-sm font-medium text-ground transition hover:bg-accent-hover disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
