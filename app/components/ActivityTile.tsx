'use client';

import { useState } from 'react';
import Modal from './Modal';
import { StructuralChange, TokenUsage } from '../lib/types';

interface ActivityTileProps {
  matchScore: number | null;
  missingRequirements: string[];
  estimatedPages: number | null;
  vague: boolean;
  vagueReason: string;
  vagueAcknowledged: boolean;
  onGoBack: () => void;
  onProceedAnyway: () => void;
  log: string[];
  structuralChanges: StructuralChange[];
  usage: TokenUsage | null;
  warnings: string[];
  onClear: () => void;
  onSend: (instruction: string) => Promise<void>;
  sending: boolean;
}

export default function ActivityTile({
  matchScore,
  missingRequirements,
  estimatedPages,
  vague,
  vagueReason,
  vagueAcknowledged,
  onGoBack,
  onProceedAnyway,
  log,
  structuralChanges,
  usage,
  warnings,
  onClear,
  onSend,
  sending,
}: ActivityTileProps) {
  const [visible, setVisible] = useState(true);
  const [message, setMessage] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);

  const unread = log.length;
  const showVagueGate = vague && !vagueAcknowledged;

  return (
    <section className="resume-card mt-6 overflow-hidden shadow-lg shadow-slate-950/10">
      <div className="flex items-center justify-between gap-4 border-b border-slate-800 bg-slate-950/95 px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">✦ AI ACTIVITY</p>
          <p className="mt-1 text-sm text-slate-400">Persistent session log and instruction center.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
            onClick={() => setConfirmingClear(true)}
          >
            Clear log
          </button>
          <button
            className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
            onClick={() => setVisible(!visible)}
          >
            {visible ? 'Hide' : `Show${unread ? ` (${unread})` : ''}`}
          </button>
        </div>
      </div>

      {visible ? (
        <div className="space-y-4 bg-slate-950 px-6 py-6 text-sm text-slate-200">
          {showVagueGate ? (
            <div className="rounded-3xl border border-warning/30 bg-warning/10 px-5 py-4">
              <p className="text-warning">⚠ This job posting doesn't have enough detail to tailor effectively.</p>
              <p className="mt-1 text-slate-300">{vagueReason || 'Consider adding more context to the job posting.'}</p>
              <p className="mt-1 text-slate-400">The AI still did its best with what it was given — see the results below.</p>
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  onClick={onGoBack}
                  className="rounded-full border border-slate-700 bg-slate-900 px-4 py-1.5 text-sm text-slate-200 hover:border-slate-500"
                >
                  Go back &amp; add more info
                </button>
                <button
                  type="button"
                  onClick={onProceedAnyway}
                  className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-slate-950 hover:bg-blue-500"
                >
                  Got it
                </button>
              </div>
            </div>
          ) : null}

          <div className="rounded-3xl border border-slate-800 bg-slate-900 px-5 py-4">
            {matchScore !== null ? <p className="text-slate-300">✦ Match score: ~{matchScore}% of key job requirements covered</p> : null}
            {missingRequirements.length > 0 ? (
              <p className="mt-1 text-slate-400">Missing: {missingRequirements.join(', ')}</p>
            ) : null}
            {estimatedPages !== null ? (
              <p className="mt-1 text-slate-400">
                {estimatedPages <= 2
                  ? `Estimated length: ${estimatedPages} page${estimatedPages === 1 ? '' : 's'} ✓`
                  : `⚠ Estimated length: ${estimatedPages} pages — consider asking me to trim content`}
              </p>
            ) : null}
            <ul className="mt-3 space-y-2">
              {log.map((entry, index) =>
                entry.startsWith('⚠') ? (
                  <li key={index} className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-warning">
                    {entry}
                  </li>
                ) : (
                  <li key={index}>• {entry}</li>
                ),
              )}
            </ul>
            {warnings.length > 0 ? (
              <div className="mt-3 space-y-1 text-warning">
                {warnings.map((warning, index) => (
                  <p key={index}>⚠ {warning}</p>
                ))}
              </div>
            ) : null}
            {usage ? (
              <p className="mt-4 text-slate-400">
                💰 Session cost: ~${usage.costUsd.toFixed(2)} (~{(usage.inputTokens + usage.outputTokens).toLocaleString()} tokens)
              </p>
            ) : null}
          </div>

          {/* ponytail: structural changes are now read-only informational items.
              The Approve/Revert flow was removed with the docx safe-copy it relied on. */}
          {structuralChanges.map((change) => (
            <div key={change.id} className="rounded-3xl border border-warning/30 bg-warning/10 px-5 py-4">
              <p className="text-warning">⚠ Structural change: {change.description}</p>
              <p className="mt-1 text-slate-300">Reason: {change.reason}</p>
            </div>
          ))}

          <div className="rounded-3xl border border-slate-800 bg-slate-900 px-5 py-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
              <div>
                <p className="text-slate-300">Type an instruction to AI...</p>
                <textarea
                  rows={3}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="e.g. Make the Kudi Kitchen bullets more concise"
                  className="mt-3 w-full rounded-3xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none"
                />
              </div>
              <button
                type="button"
                disabled={sending || !message.trim()}
                className="mt-4 h-fit rounded-3xl bg-accent px-6 py-4 text-sm font-semibold text-slate-950 hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700"
                onClick={async () => {
                  const instruction = message.trim();
                  if (!instruction) return;
                  setMessage('');
                  await onSend(instruction);
                }}
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmingClear ? (
        <Modal
          title="Clear the activity log?"
          message="This can't be undone."
          actions={[
            { label: 'Cancel', onClick: () => setConfirmingClear(false) },
            {
              label: 'Clear',
              variant: 'primary',
              onClick: () => {
                setConfirmingClear(false);
                onClear();
              },
            },
          ]}
        />
      ) : null}
    </section>
  );
}
