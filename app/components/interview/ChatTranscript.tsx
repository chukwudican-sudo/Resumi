'use client';

import { useEffect, useRef } from 'react';
import type { Fact, InterviewTurn } from '../../lib/types';
import FactChip from './FactChip';

interface ChatTranscriptProps {
  turns: InterviewTurn[];
  /** Facts keyed by the turn they came from, so each answer shows what it banked. */
  factsByTurn: Map<string, Fact[]>;
  acknowledgement: string;
  thinking: boolean;
}

export default function ChatTranscript({ turns, factsByTurn, acknowledgement, thinking }: ChatTranscriptProps) {
  const endRef = useRef<HTMLDivElement | null>(null);

  // Keep the newest exchange in view as the conversation grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, thinking, acknowledgement]);

  return (
    <div className="flex flex-col gap-6">
      {turns.map((turn) => {
        const facts = factsByTurn.get(turn.id) ?? [];
        return (
          <div key={turn.id} className="flex flex-col gap-3">
            <p className="text-sm text-slate-400">{turn.question.text}</p>

            <div className="self-end rounded-3xl rounded-br-lg border border-slate-700 bg-slate-900 px-5 py-3 text-slate-100">
              {turn.skipped || !turn.rawAnswer.trim() ? (
                <span className="text-slate-500">Skipped</span>
              ) : (
                turn.rawAnswer
              )}
            </div>

            {facts.length ? (
              <div className="flex flex-col gap-2">
                {facts.map((fact) => (
                  <FactChip key={fact.id} fact={fact} />
                ))}
              </div>
            ) : null}
          </div>
        );
      })}

      {acknowledgement && !thinking ? (
        <p className="text-sm italic text-slate-500">{acknowledgement}</p>
      ) : null}

      {thinking ? (
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-accent" />
          Thinking about what to ask next…
        </div>
      ) : null}

      <div ref={endRef} />
    </div>
  );
}
