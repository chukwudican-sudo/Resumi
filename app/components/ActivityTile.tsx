'use client';

import { useMemo, useState } from 'react';
import Modal from './Modal';
import { DebugInfo, StructuralChange, TokenUsage } from '../lib/types';

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
  debugInfo: DebugInfo | null;
  onClear: () => void;
  onApprove: (id: string) => void;
  onRevert: (id: string) => void;
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
  debugInfo,
  onClear,
  onApprove,
  onRevert,
  onSend,
  sending,
}: ActivityTileProps) {
  const [visible, setVisible] = useState(true);
  const [debugOpen, setDebugOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);

  const pendingChanges = useMemo(() => structuralChanges.filter((change) => change.status === 'pending'), [structuralChanges]);
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

          {pendingChanges.map((change) => (
            <div key={change.id} className="rounded-3xl border border-warning/30 bg-warning/10 px-5 py-4">
              <p className="text-warning">⚠ Structural change: {change.description}</p>
              <p className="mt-1 text-slate-300">Reason: {change.reason}</p>
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-slate-950 hover:bg-blue-500"
                  onClick={() => onApprove(change.id)}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="rounded-full border border-slate-700 bg-slate-900 px-4 py-1.5 text-sm text-slate-200 hover:border-slate-500"
                  onClick={() => onRevert(change.id)}
                >
                  Revert
                </button>
              </div>
            </div>
          ))}

          <div className="rounded-3xl border border-slate-800 bg-slate-900 px-5 py-4">
            <button
              type="button"
              onClick={() => setDebugOpen((o) => !o)}
              className="flex w-full items-center justify-between text-left text-xs text-slate-400 hover:text-slate-200"
            >
              <span className="font-semibold uppercase tracking-widest">Debug — last tailor session</span>
              <span>{debugOpen ? '▲ Hide' : '▼ Show'}</span>
            </button>

            {debugOpen ? (
              <div className="mt-4 space-y-4 text-xs text-slate-400">
                {debugInfo ? (
                  <>
                    <div>
                      <p className="mb-1 font-semibold text-slate-300">Inputs sent to Claude</p>
                      <p>About Me PDF: {debugInfo.aboutMePresent ? `✓ present (${debugInfo.aboutMeSizeKb}KB)` : '✗ not uploaded'}</p>
                      <p>Resume Rules: {debugInfo.rulesPresent ? `✓ present (${debugInfo.rulesSizeKb}KB)` : '— not provided (optional)'}</p>
                      <p>
                        Job Posting: {debugInfo.jobCompany || '(company not set)'} · {debugInfo.jobRole || '(role not set)'}
                      </p>
                      <p>
                        Description: {debugInfo.jobDescriptionChars > 0 ? `✓ ${debugInfo.jobDescriptionChars.toLocaleString()} chars` : '✗ empty'}
                        {debugInfo.jobDescriptionChars > 0 ? ` — "${debugInfo.jobDescriptionPreview.slice(0, 120)}${debugInfo.jobDescriptionPreview.length > 120 ? '…' : ''}"` : ''}
                      </p>
                      <p>Screenshots: {debugInfo.jobImageCount > 0 ? `✓ ${debugInfo.jobImageCount} attached` : '— none'}</p>
                      <p>
                        Resume: {debugInfo.paragraphCount} paragraphs total, {debugInfo.editableParagraphCount} editable
                      </p>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-3 font-mono text-[11px] leading-5 text-slate-400">
                        {debugInfo.paragraphsPreview}
                        {debugInfo.paragraphCount > 5 ? `\n… (${debugInfo.paragraphCount - 5} more paragraphs)` : ''}
                      </pre>
                    </div>

                    <div>
                      <p className="mb-1 font-semibold text-slate-300">Claude's response</p>
                      <p>Paragraphs returned: {debugInfo.claudeParagraphsReturned}</p>
                      <p>
                        Changed:{' '}
                        <span className={debugInfo.claudeChangedCount === 0 ? 'text-warning' : 'text-accent'}>
                          {debugInfo.claudeChangedCount} of {debugInfo.editableParagraphCount} editable paragraphs
                        </span>
                        {debugInfo.claudeChangedIndices.length > 0
                          ? ` (indices: ${debugInfo.claudeChangedIndices.join(', ')})`
                          : ''}
                      </p>
                      <p>Match score: {debugInfo.claudeMatchScore !== null ? `${debugInfo.claudeMatchScore}%` : 'n/a'}</p>
                      <p>Vague detection: {debugInfo.claudeVague ? '⚠ flagged as vague' : '✓ not vague'}</p>
                      {debugInfo.claudeLogPreview ? (
                        <p className="mt-1">Log preview: "{debugInfo.claudeLogPreview}{debugInfo.claudeLogPreview.length >= 200 ? '…' : ''}"</p>
                      ) : null}
                    </div>

                    {usage ? (
                      <div>
                        <p className="mb-1 font-semibold text-slate-300">Tokens &amp; cost</p>
                        <p>Input: {usage.inputTokens.toLocaleString()} tokens</p>
                        <p>Output: {usage.outputTokens.toLocaleString()} tokens</p>
                        <p>Estimated cost: ~${usage.costUsd.toFixed(4)}</p>
                      </div>
                    ) : null}

                    <p className="text-slate-600">Session at {new Date(debugInfo.sentAt).toLocaleString()}</p>
                  </>
                ) : (
                  <p className="text-slate-500">No debug data yet — complete a tailor session first.</p>
                )}
              </div>
            ) : null}
          </div>

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
