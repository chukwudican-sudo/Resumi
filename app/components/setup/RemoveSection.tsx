'use client';

import { useState, useTransition } from 'react';
import { removeSection } from '../../server/actions';

/**
 * Getting rid of a section, and everything in it.
 *
 * Armed before it fires, and it says how much goes — the same shape of
 * confirmation deleting a single entry gets, for the same reason: the delete is
 * a hard delete, so afterwards there is nothing to say the section ever
 * existed. Somebody removed an entry that way while testing once and neither
 * they nor the database could tell later that it had happened.
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
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      try {
        await removeSection(sectionKey);
        setArmed(false);
        onRemoved();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That did not go through.');
      }
    });
  }

  return (
    <div className="mt-10 border-t border-rule pt-5">
      {armed ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] text-flag-ink">
            Remove {label} for good?
            {entries > 0 ? ` ${entries} ${entries === 1 ? 'entry goes' : 'entries go'} with it.` : ''}
          </span>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="text-[13px] font-medium text-flag transition hover:text-flag-ink disabled:opacity-50"
          >
            {pending ? 'Removing…' : 'Yes, remove'}
          </button>
          <button
            type="button"
            onClick={() => setArmed(false)}
            className="text-[13px] text-ink-muted transition hover:text-ink"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="text-[13px] text-ink-faint transition hover:text-flag"
        >
          Remove this section
        </button>
      )}
      {error ? <p className="mt-2 text-[12.5px] text-flag">{error}</p> : null}
    </div>
  );
}
