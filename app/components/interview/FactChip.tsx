'use client';

import type { Fact } from '../../lib/types';

/**
 * One captured fact.
 *
 * These exist so the interview visibly banks something after every answer. A
 * question-and-answer loop with no feedback feels like a form; watching facts
 * accumulate is what makes it feel like progress.
 */
export default function FactChip({ fact }: { fact: Fact }) {
  const weak = fact.category === 'metric' && !fact.hasNumber;

  return (
    <div
      className={`rounded-xl border px-3 py-2 text-sm ${
        weak ? 'border-warning/30 bg-warning/10 text-warning' : 'border-slate-800 bg-slate-950 text-slate-300'
      }`}
    >
      <span className="mr-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">{fact.category}</span>
      {fact.text}
    </div>
  );
}
