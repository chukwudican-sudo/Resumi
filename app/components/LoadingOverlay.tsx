'use client';

import { useEffect, useMemo, useState } from 'react';

interface LoadingOverlayProps {
  hasRulesPdf: boolean;
  complete: boolean;
  onCancel?: () => void;
}

const STAGE_DURATION_MS = 2500;

function buildStages(hasRulesPdf: boolean): string[] {
  const stages = ['Reading your background...'];
  if (hasRulesPdf) stages.push('Reading your resume rules...');
  stages.push('Reading the job posting...', 'Tailoring your resume...', 'Finalizing...');
  return stages;
}

export default function LoadingOverlay({ hasRulesPdf, complete, onCancel }: LoadingOverlayProps) {
  const stages = useMemo(() => buildStages(hasRulesPdf), [hasRulesPdf]);
  const [stageIndex, setStageIndex] = useState(0);
  const holdIndex = stages.length - 2; // "Tailoring your resume..." — hold here until complete
  const finalIndex = stages.length - 1; // "Finalizing..."

  // Time-based auto-advance through the early "reading" stages — the
  // backend is one atomic API call with no granular progress events, so
  // this is a reasonable estimate per stage rather than a live measurement.
  useEffect(() => {
    if (complete || stageIndex >= holdIndex) return;
    const timer = setTimeout(() => setStageIndex((i) => Math.min(i + 1, holdIndex)), STAGE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [stageIndex, complete, holdIndex]);

  // Jump straight to "Finalizing..." the moment the real API response lands.
  useEffect(() => {
    if (complete) setStageIndex(finalIndex);
  }, [complete, finalIndex]);

  const activeIndex = complete ? finalIndex : Math.min(stageIndex, holdIndex);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-slate-950/90 px-6 text-center">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-accent" />

      <div className="flex flex-col items-center gap-4">
        <p className="text-lg font-semibold text-white">{stages[activeIndex]}</p>

        <div className="flex items-center gap-2">
          {stages.map((stage, index) => {
            const isComplete = index < activeIndex;
            const isActive = index === activeIndex;
            return (
              <div key={stage} className="flex items-center gap-2">
                <div
                  className={`h-2.5 w-2.5 rounded-full transition-colors ${
                    isComplete ? 'bg-accent' : isActive ? 'bg-accent animate-pulse' : 'bg-slate-700'
                  }`}
                  title={stage}
                />
                {index < stages.length - 1 ? (
                  <div className={`h-0.5 w-8 transition-colors ${isComplete ? 'bg-accent' : 'bg-slate-700'}`} />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {onCancel && !complete ? (
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-slate-700 px-5 py-2 text-sm text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
        >
          Cancel
        </button>
      ) : null}
    </div>
  );
}
