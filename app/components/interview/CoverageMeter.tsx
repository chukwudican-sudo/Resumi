'use client';

import type { InterviewPhase } from '../../lib/types';

const PHASES: { key: InterviewPhase; label: string }[] = [
  { key: 'identity', label: 'About you' },
  { key: 'breadth', label: 'Your work' },
  { key: 'depth', label: 'The details' },
  { key: 'skills', label: 'Skills' },
];

interface CoverageMeterProps {
  phase: InterviewPhase;
  coverage: number;
  turnCount: number;
  maxTurns: number;
}

/**
 * Progress along the four phases plus how complete the profile is.
 *
 * Both numbers are shown because they answer different questions: the phase
 * says how much conversation is left, the percentage says whether it is
 * actually working. Without them the interview is an open-ended list of
 * questions, which is the thing people abandon.
 */
export default function CoverageMeter({ phase, coverage, turnCount, maxTurns }: CoverageMeterProps) {
  const activeIndex = PHASES.findIndex((p) => p.key === phase);
  const percent = Math.round(coverage * 100);

  return (
    <div className="resume-card p-5 shadow-lg shadow-slate-950/10">
      <div className="flex items-baseline justify-between">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Profile</p>
        <p className="text-sm text-slate-400">
          <span className="font-semibold text-white">{percent}%</span> complete
        </p>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${Math.max(percent, 2)}%` }}
        />
      </div>

      <div className="mt-5 flex flex-col gap-2">
        {PHASES.map((p, i) => {
          const done = i < activeIndex;
          const active = i === activeIndex;
          return (
            <div key={p.key} className="flex items-center gap-3">
              <div
                className={`h-2 w-2 shrink-0 rounded-full transition-colors ${
                  done ? 'bg-accent' : active ? 'animate-pulse bg-accent' : 'bg-slate-700'
                }`}
              />
              <span className={`text-sm ${active ? 'text-white' : done ? 'text-slate-400' : 'text-slate-600'}`}>
                {p.label}
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-5 text-xs text-slate-500">
        Question {Math.min(turnCount + 1, maxTurns)} of at most {maxTurns}
      </p>
    </div>
  );
}
