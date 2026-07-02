'use client';

import { UNIVERSAL_RULES } from '../lib/systemPrompt';

interface SystemPromptModalProps {
  onClose: () => void;
}

export default function SystemPromptModal({ onClose }: SystemPromptModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-6">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-slate-950/50">
        <h2 className="text-lg font-semibold text-white">How Resumi's AI Works</h2>
        <p className="mt-1 text-sm text-slate-400">
          The universal rules and tailoring instructions the AI follows every session. Read-only.
        </p>
        <div className="mt-4 flex-1 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950 p-4">
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-300">{UNIVERSAL_RULES}</pre>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-blue-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
