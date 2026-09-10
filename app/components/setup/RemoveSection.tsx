'use client';

import { useState, useTransition } from 'react';
import { removeSection, restoreSection } from '../../server/actions';
import { useUndo } from '../undo/UndoProvider';
import { useConfirm } from '../undo/ConfirmProvider';

/**
 * Getting rid of a section, and everything in it.
 *
 * Asks first, like every other delete now does, and the question carries the
 * one fact this screen cannot show: how many entries go with it. They are filed
 * under the section rather than displayed on it, so "3 entries go with it" is
 * not something you could have worked out by looking.
 *
 * It used to arm itself inline instead — a row of small words appearing where
 * the button was. That was a second pattern for the same job, and the app ended
 * up with two of those and two deletes with no question at all.
 *
 * Sits under whichever editor is open rather than inside each of the five, so
 * the editors know nothing about it.
 */
export default function RemoveSection({
  sectionKey,
  label,
  entries,
  onRemoved,
}: {
  sectionKey: string;
  label: string;
  /** How many entries go with it. Zero for a section holding text or a list. */
  entries: number;
  onRemoved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { offer } = useUndo();
  const ask = useConfirm();

  async function remove() {
    const confirmed = await ask({
      title: `Remove ${label}?`,
      body:
        entries > 0
          ? `${entries} ${entries === 1 ? 'entry goes' : 'entries go'} with it.`
          : 'The section comes off your resume.',
      action: 'Remove',
    });
    if (!confirmed) return;

    setError(null);
    startTransition(async () => {
      try {
        const gone = await removeSection(sectionKey);
        onRemoved();
        offer({
          message:
            gone.count > 0
              ? `${label} removed, with ${gone.count} ${gone.count === 1 ? 'entry' : 'entries'}.`
              : `${label} removed.`,
          // The whole previous plan, not the one section. Removing a section
          // re-inserts every survivor with a fresh id, so putting one row back
          // would leave the rest of the plan holding ids nobody has.
          undo: async () => {
            await restoreSection(gone.previous, gone.entries);
            onRemoved();
          },
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That did not go through.');
      }
    });
  }

  return (
    <div className="mt-10 border-t border-rule pt-5">
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="text-[13px] text-ink-faint transition hover:text-flag disabled:opacity-50"
      >
        {pending ? 'Removing…' : 'Remove this section'}
      </button>
      {error ? <p className="mt-2 text-[12.5px] text-flag">{error}</p> : null}
    </div>
  );
}
