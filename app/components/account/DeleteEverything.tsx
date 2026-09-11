'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteEverything } from '../../server/actions';

/**
 * The way out.
 *
 * Behind a typed confirmation rather than a second button, because the two
 * clicks of a normal confirm dialog are close enough together to be one
 * reflex. Typing the word is a deliberate act, and this cannot be undone.
 */
export default function DeleteEverything() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[13px] text-ink-faint underline decoration-rule-field underline-offset-4 transition hover:text-flag"
      >
        Delete everything Resumi9 knows about me
      </button>
    );
  }

  return (
    <div className="flex max-w-[520px] flex-col rounded-md border border-flag-line bg-flag-bg p-5">
      <span className="text-[14px] font-medium text-flag-ink">
        This removes your entire history, permanently.
      </span>
      <p className="mt-2 text-[13.5px] leading-relaxed text-flag-ink">
        Your resume, every entry and bullet, your rules, every application and every version of
        every resume you have generated. There is no copy and no undo. Your sign-in stays &mdash;
        you can delete that from your account menu.
      </p>

      <label className="mt-4 flex flex-col gap-2">
        <span className="text-[13px] text-flag-ink">
          Type <strong>delete</strong> to confirm.
        </span>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoFocus
          className="w-full max-w-[200px] rounded border border-rule-field bg-ground-surface px-3.5 py-2.5 text-[14px] outline-none focus:border-flag"
        />
      </label>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          disabled={pending || typed.trim().toLowerCase() !== 'delete'}
          onClick={() =>
            startTransition(async () => {
              await deleteEverything();
              router.push('/');
            })
          }
          className="rounded bg-flag px-5 py-2.5 text-[13px] font-medium text-ground transition disabled:bg-rule-field disabled:text-ink-ghost"
        >
          {pending ? 'Deleting…' : 'Delete everything'}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setTyped(''); }}
          disabled={pending}
          className="text-[13px] text-ink-muted transition hover:text-ink disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
