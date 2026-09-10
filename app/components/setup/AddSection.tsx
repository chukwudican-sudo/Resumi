'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { addSection, removeSection } from '../../server/actions';
import { useUndo } from '../undo/UndoProvider';
import { ADDABLE, LAYOUTS, keyFor } from '../../lib/sections';
import type { SectionShape } from '../../lib/types';

/**
 * A section somebody does not have yet.
 *
 * Named things, not layouts. Every resume guide talks about a Summary or a
 * Certifications section; none of them talk about a "prose section", and asking
 * somebody to pick one before they have said what they want is asking them to
 * do the app's job. So the list is sections, each carrying its own layout, and
 * the word never appears — except behind "Something else", where there is
 * genuinely no way to know.
 *
 * Sections already on the resume are not offered at all, which is the honest
 * form of preventing duplicates: the server refuses them too, but a person
 * should not be able to reach a refusal from a list.
 */
export default function AddSection({
  taken,
  disabled,
  onAdded,
  onUndone,
}: {
  /** Keys already on this resume, so the list only offers what is missing. */
  taken: Set<string>;
  /** Held shut while a form has unsaved changes — adding refreshes the page. */
  disabled: boolean;
  onAdded: (key: string) => void;
  /**
   * Taking the new section away again, which is not the same gesture as adding
   * one: the screen is sitting on the section that just stopped existing, so it
   * has to move somewhere as well as refresh.
   */
  onUndone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [label, setLabel] = useState('');
  const [shape, setShape] = useState<SectionShape>('entries');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { offer } = useUndo();
  const panel = useRef<HTMLDivElement>(null);

  // Resolved through keyFor, not by slugging the label here. A second way of
  // turning a name into a key is a second answer, and the two would disagree
  // on exactly the cases keyFor exists for — "Awards" against an existing
  // "Awards & Honours" would still be offered, and then refused on click.
  const offered = ADDABLE.filter((a) => !taken.has(keyFor(a.label)));

  function close() {
    setOpen(false);
    setNaming(false);
    setLabel('');
    setError(null);
  }

  /**
   * Clicking anywhere else puts it away, and so does Escape.
   *
   * A panel that only closes by pressing the button that opened it is a panel
   * you have to remember how to dismiss — and this one covers Profile Strength
   * while it sits there. Pointerdown rather than click so it closes on the way
   * down, before whatever was underneath reacts.
   *
   * Bound only while it is open: a document listener left attached for the life
   * of the page runs on every click in the app to decide it has nothing to do.
   */
  useEffect(() => {
    if (!open) return;

    const away = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node)) close();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  function add(name: string, withShape: SectionShape) {
    setError(null);
    startTransition(async () => {
      try {
        const key = await addSection(name, withShape);
        close();
        onAdded(key);
        offer({
          // Removing it again is the undo, and it is safe to offer without a
          // confirmation: the section was made a second ago, so there is
          // nothing filed under it yet for the count to warn about.
          message: `${name.trim()} added.`,
          undo: async () => {
            await removeSection(key);
            onUndone();
          },
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That did not go through.');
      }
    });
  }

  return (
    <div ref={panel} className="relative mt-3 hidden lg:block">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        disabled={disabled || pending}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-accent transition hover:bg-ground-panel disabled:opacity-40 disabled:hover:bg-transparent"
      >
        <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        {pending ? 'Adding…' : 'Add a section'}
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-50 mt-1 rounded-lg border border-rule bg-ground-surface p-3 shadow-xl shadow-ink/10">
          {naming ? (
            <>
              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] text-ink-prose">What is it called?</span>
                <input
                  autoFocus
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Leadership"
                  className="rounded border border-rule-field bg-ground px-3 py-2 text-[14px] outline-none transition placeholder:text-ink-ghost focus:border-accent"
                />
              </label>

              <span className="mt-3.5 block text-[12.5px] text-ink-prose">What goes in it?</span>
              <div className="mt-1.5 flex flex-col gap-1">
                {LAYOUTS.map((l) => (
                  <button
                    key={l.shape}
                    type="button"
                    onClick={() => setShape(l.shape)}
                    className={`rounded px-2.5 py-2 text-left transition ${
                      shape === l.shape ? 'bg-accent-tint' : 'hover:bg-ground-panel'
                    }`}
                  >
                    <span className="block text-[13px] text-ink">{l.label}</span>
                    <span className="block text-[11.5px] leading-snug text-ink-faint">{l.detail}</span>
                  </button>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-rule pt-3">
                <button
                  type="button"
                  onClick={() => setNaming(false)}
                  className="text-[12.5px] text-ink-muted transition hover:text-ink"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => add(label, shape)}
                  disabled={!label.trim() || pending}
                  className="rounded bg-accent px-3.5 py-1.5 text-[13px] font-medium text-ground transition hover:bg-accent-hover disabled:opacity-50"
                >
                  Add it
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-0.5">
              {offered.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => add(a.label, a.shape)}
                  disabled={pending}
                  className="rounded px-2.5 py-2 text-left transition hover:bg-ground-panel disabled:opacity-50"
                >
                  <span className="block text-[13.5px] text-ink">{a.label}</span>
                  <span className="block text-[11.5px] leading-snug text-ink-faint">{a.detail}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setNaming(true)}
                className="mt-1 rounded border-t border-rule px-2.5 pb-2 pt-3 text-left text-[13.5px] text-accent transition hover:bg-ground-panel"
              >
                Something else&hellip;
              </button>
            </div>
          )}

          {error ? <p className="mt-2.5 text-[12px] leading-snug text-flag">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
