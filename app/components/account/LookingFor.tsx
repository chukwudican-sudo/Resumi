'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CAREER_STAGE_LABELS, type CareerStage } from '../../lib/types';
import { saveOnboardingGoal } from '../../server/actions';

const STAGES = Object.keys(CAREER_STAGE_LABELS) as CareerStage[];

/**
 * What this person is hunting for.
 *
 * Set once during onboarding and then unreachable, because onboarding sends
 * anybody with a finished resume straight to their applications — so a student
 * who took an internship and started looking for a new-grad role had no way to
 * say so, on the one setting that describes what they want.
 *
 * Unlike the language picker this has a free-text field beside the choice, so
 * it saves on a button rather than on every keystroke.
 */
export default function LookingFor({
  stage,
  targetField,
}: {
  stage: string | null;
  targetField: string | null;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<CareerStage>((stage as CareerStage) ?? 'internship');
  const [field, setField] = useState(targetField ?? '');
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = chosen !== stage || field !== (targetField ?? '');

  function save() {
    startTransition(async () => {
      await saveOnboardingGoal(chosen, field);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {STAGES.map((key) => {
          const on = chosen === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => { setChosen(key); setSaved(false); }}
              aria-pressed={on}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] transition ${
                on
                  ? 'border-accent bg-accent-tint text-accent'
                  : 'border-rule-field bg-ground-surface text-ink-prose hover:border-ink-faint'
              }`}
            >
              {CAREER_STAGE_LABELS[key]}
            </button>
          );
        })}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-ink-prose">Field or role</span>
        <input
          type="text"
          value={field}
          maxLength={120}
          onChange={(e) => { setField(e.target.value); setSaved(false); }}
          placeholder="Software engineering"
          className="rounded border border-rule-field bg-ground-surface px-3.5 py-2.5 text-[14.5px] outline-none transition placeholder:text-ink-ghost focus:border-accent"
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded bg-accent px-4 py-2 text-[13.5px] font-medium text-ground transition hover:bg-accent-hover disabled:opacity-40"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        {saved && !dirty ? <span className="text-[12.5px] text-ink-muted">Saved</span> : null}
      </div>
    </div>
  );
}
