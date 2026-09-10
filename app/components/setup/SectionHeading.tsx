'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { renameSection } from '../../server/actions';
import { useUndo } from '../undo/UndoProvider';

/**
 * A section's name, which is the person's to change.
 *
 * Adding a section from the list means accepting the app's wording for a
 * heading on somebody else's resume — "Extracurricular & Community Activities"
 * when they would have written "Activities". So the heading is the control:
 * click the words to change the words, rather than hunting for a Rename button
 * at the foot of the page.
 *
 * Only the label moves. The key underneath is an internal id every entry is
 * filed against, and renaming has no business touching it.
 */
export default function SectionHeading({
  sectionKey,
  label,
  onRenamed,
}: {
  sectionKey: string;
  label: string;
  onRenamed: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { offer } = useUndo();
  const input = useRef<HTMLInputElement>(null);

  // Reset when the section changes under it, and select the whole name on open
  // so replacing it outright is one gesture rather than a text-selection chore.
  useEffect(() => {
    setDraft(label);
    setEditing(false);
    setError(null);
  }, [sectionKey, label]);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  function save() {
    const name = draft.trim();
    if (!name || name === label) {
      setEditing(false);
      setDraft(label);
      return;
    }
    const before = label;
    startTransition(async () => {
      try {
        await renameSection(sectionKey, name);
        setEditing(false);
        onRenamed();
        offer({
          message: `Renamed to ${name}.`,
          undo: async () => {
            await renameSection(sectionKey, before);
            onRenamed();
          },
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That name did not go through.');
      }
    });
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setError(null); setEditing(true); }}
        title="Click to rename"
        className="group flex items-center gap-2.5 text-left"
      >
        <span className="font-serif text-[34px] leading-tight">{label}</span>
        {/* Faint until hovered: the heading should read as a heading first. */}
        <svg
          width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
          className="mt-1 shrink-0 text-transparent transition group-hover:text-ink-ghost"
          aria-hidden="true"
        >
          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
        </svg>
      </button>
    );
  }

  return (
    <div>
      <input
        ref={input}
        value={draft}
        disabled={pending}
        onChange={(e) => { setDraft(e.target.value); setError(null); }}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); save(); }
          if (e.key === 'Escape') { setDraft(label); setEditing(false); setError(null); }
        }}
        aria-label="Section name"
        className="w-full rounded border border-rule-field bg-ground-surface px-3 py-1.5 font-serif text-[34px] leading-tight outline-none transition focus:border-accent disabled:opacity-60"
      />
      <span className="mt-1.5 block text-[12px] text-ink-faint">
        {pending ? 'Renaming…' : 'Enter to save · Esc to cancel'}
      </span>
      {error ? <p className="mt-1 text-[12.5px] text-flag">{error}</p> : null}
    </div>
  );
}
