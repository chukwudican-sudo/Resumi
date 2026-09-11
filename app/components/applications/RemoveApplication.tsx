'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useUndo } from '../undo/UndoProvider';
import { useConfirm } from '../undo/ConfirmProvider';
import { removeApplication, restoreApplication } from '../../server/actions';

/**
 * Taking one application off the list.
 *
 * A sibling of the row's link rather than a child of it, because a button
 * inside an anchor is a control you cannot press without also following the
 * link — and the link goes to the thing you are trying to get rid of.
 *
 * Faint rather than hidden. The usual treatment is to reveal a delete on hover,
 * which on a touch screen means a control that does not exist, and this is the
 * only way to tidy a list that fills up by design.
 */
export default function RemoveApplication({
  applicationId,
  label,
}: {
  applicationId: string;
  /** "Credit Risk Analyst Intern at RBC" — named so the toast can say what went. */
  label: string;
}) {
  const router = useRouter();
  const { offer } = useUndo();
  const ask = useConfirm();
  const [pending, startTransition] = useTransition();

  async function remove() {
    const confirmed = await ask({
      title: `Remove ${label}?`,
      // What they cannot see from the list: the posting copy goes too, and this
      // screen's own form promises to keep it. Undo is offered either way, but
      // the dialog is where somebody decides, so it says so here.
      body: 'This takes the saved posting and every version of the resume with it. You can undo straight after.',
      action: 'Remove',
    });
    if (!confirmed) return;

    startTransition(async () => {
      const removed = await removeApplication(applicationId);
      // False when it had already gone — a second press, or another tab. No
      // toast, because undo would then restore something nothing just deleted.
      if (!removed) return;
      offer({
        message: `${label} removed.`,
        undo: async () => {
          await restoreApplication(applicationId);
          router.refresh();
        },
      });
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={pending}
      aria-label={`Remove ${label}`}
      className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-2 text-ink-ghost transition hover:bg-ground-band hover:text-ink-prose focus-visible:text-ink-prose disabled:opacity-40"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  );
}
