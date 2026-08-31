'use client';

import { useEffect, useRef, useState } from 'react';
import type { InterviewQuestion } from '../../lib/types';

interface AnswerComposerProps {
  question: InterviewQuestion;
  disabled: boolean;
  /** Persisted per interview so a crash mid-typing loses nothing. */
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: (answer: string) => void;
  onSkip: () => void;
  onFinish: () => void;
}

export default function AnswerComposer({
  question,
  disabled,
  draft,
  onDraftChange,
  onSubmit,
  onSkip,
  onFinish,
}: AnswerComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [showChoices, setShowChoices] = useState(true);

  // Focus the box on each new question so answering never needs a click.
  useEffect(() => {
    setShowChoices(true);
    if (!disabled) textareaRef.current?.focus();
  }, [question.text, disabled]);

  function submit() {
    const value = draft.trim();
    if (!value || disabled) return;
    onSubmit(value);
  }

  return (
    <div className="flex flex-col gap-3">
      {question.choices?.length && showChoices ? (
        <div className="flex flex-wrap gap-2">
          {question.choices.map((choice) => (
            <button
              key={choice}
              type="button"
              disabled={disabled}
              onClick={() => { setShowChoices(false); onSubmit(choice); }}
              className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent transition hover:border-accent disabled:opacity-50"
            >
              {choice}
            </button>
          ))}
        </div>
      ) : null}

      <textarea
        ref={textareaRef}
        rows={3}
        value={draft}
        disabled={disabled}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends; Shift+Enter makes a new line. Most answers are one
          // line, so requiring a click for every one would add up.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder="Type your answer…"
        className="w-full rounded-3xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition hover:border-slate-500 focus:border-slate-500 disabled:opacity-60"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {question.skippable ? (
            <button
              type="button"
              onClick={onSkip}
              disabled={disabled}
              className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500 disabled:opacity-50"
            >
              Skip
            </button>
          ) : null}
          <button
            type="button"
            onClick={onFinish}
            disabled={disabled}
            className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-400 transition hover:border-slate-500 hover:text-slate-200 disabled:opacity-50"
          >
            I&rsquo;m done for now
          </button>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={disabled || !draft.trim()}
          className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-500"
        >
          Send
        </button>
      </div>

      <p className="text-xs text-slate-600">Enter to send · Shift + Enter for a new line</p>
    </div>
  );
}
