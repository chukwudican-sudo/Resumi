'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import ActivityTile from './ActivityTile';
import Header from './Header';
import Modal from './Modal';
import Toast from './Toast';
import LatexPdfPreview from './LatexPdfPreview';
import { renderResumeLatex } from '../lib/latexEngine';
import { compileLatexToPdf } from '../lib/compileLatex';
import { buildDefaultFilenameBase, sanitizeFilenameInput } from '../lib/filename';
import { downloadBlob } from '../lib/base64';
import {
  ApiErrorPayload,
  DebugInfo,
  DocumentFileState,
  ResumeStructure,
  SessionState,
  emptyDocumentFile,
  emptySession,
} from '../lib/types';

function getRelativeTime(isoDate: string): string {
  if (!isoDate) return '';
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return 'just now';
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
  const diffHours = Math.floor(diffMins / 60);
  return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
}

export default function ReviewShell() {
  const router = useRouter();
  const [sourceStructure] = useLocalStorageState<ResumeStructure | null>('resumi-source-structure', null);
  const [aboutMe] = useLocalStorageState<DocumentFileState>('resumi-about-me', emptyDocumentFile);
  const [resumeRules] = useLocalStorageState<DocumentFileState>('resumi-resume-rules', emptyDocumentFile);
  const [tailoredStructure, setTailoredStructure] = useLocalStorageState<ResumeStructure | null>('resumi-tailored-structure', null);
  const [session, setSession] = useLocalStorageState<SessionState>('resumi-session', emptySession);
  const [userName] = useLocalStorageState<string>('resumi_user_name', '');
  const [debugInfo] = useLocalStorageState<DebugInfo | null>('resumi-debug-info', null);

  const [sending, setSending] = useState(false);
  const [apiError, setApiError] = useState<ApiErrorPayload | null>(null);
  const [filenameBase, setFilenameBase] = useState(() => buildDefaultFilenameBase(userName, session.role, session.company));
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [interruptedNotice, setInterruptedNotice] = useState(false);
  const [relativeTime, setRelativeTime] = useState('');
  const [downloadPulse, setDownloadPulse] = useState(false);
  const prevDocxVersionRef = useRef<number>(0);

  // Render both structures into the canonical Template (Jake Gutierrez LaTeX).
  // LatexPdfPreview compiles these to PDFs in the browser (debounced).
  const originalLatex = useMemo(() => (sourceStructure ? renderResumeLatex(sourceStructure) : ''), [sourceStructure]);
  const tailoredLatex = useMemo(() => (tailoredStructure ? renderResumeLatex(tailoredStructure) : ''), [tailoredStructure]);

  useEffect(() => {
    setFilenameBase(buildDefaultFilenameBase(userName, session.role, session.company));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.role, session.company]);

  // On mount: detect a truly interrupted session — the tab was closed or the
  // browser crashed while a tailor request was in flight. Tailor now always
  // completes before navigating here, so session.tailoring being true on mount
  // means the request never finished.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('resumi-session');
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.tailoring) {
        setSession((prev) => ({ ...prev, tailoring: false, updating: false }));
        setInterruptedNotice(true);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep "Generated X ago" label fresh — recalculate every 30 seconds.
  useEffect(() => {
    setRelativeTime(getRelativeTime(session.resumeGeneratedAt));
    const id = setInterval(() => setRelativeTime(getRelativeTime(session.resumeGeneratedAt)), 30_000);
    return () => clearInterval(id);
  }, [session.resumeGeneratedAt]);

  // Pulse the download button whenever a new version lands.
  // Skip the very first render (prevDocxVersionRef = 0) so we don't pulse
  // on initial page load — only on actual version increments.
  useEffect(() => {
    const version = session.resumeVersion;
    if (version > 0 && version !== prevDocxVersionRef.current) {
      const shouldPulse = prevDocxVersionRef.current > 0;
      prevDocxVersionRef.current = version;
      if (shouldPulse) {
        setDownloadPulse(true);
        const id = setTimeout(() => setDownloadPulse(false), 1500);
        return () => clearTimeout(id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.resumeVersion]);

  async function handleSendInstruction(instruction: string) {
    setSending(true);
    try {
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'instruct',
          instruction,
          structure: tailoredStructure,
          aboutMe: { base64: aboutMe.base64, mimeType: aboutMe.mimeType },
          rules: { base64: resumeRules.base64, mimeType: resumeRules.mimeType },
          jobPosting: { company: session.company, role: session.role, description: session.jobDescription },
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setApiError(data.error || { type: 'generic', message: 'The AI service is temporarily unavailable. Please try again.' });
        return;
      }
      setTailoredStructure(data.structure);
      setSession({
        ...session,
        estimatedPages: data.estimatedPages ?? session.estimatedPages,
        log: [...session.log, ...(data.log || [])],
        warnings: [...session.warnings, ...(data.warnings || [])],
        usage: data.usage
          ? {
              inputTokens: (session.usage?.inputTokens || 0) + data.usage.inputTokens,
              outputTokens: (session.usage?.outputTokens || 0) + data.usage.outputTokens,
              costUsd: (session.usage?.costUsd || 0) + data.usage.costUsd,
            }
          : session.usage,
        resumeVersion: (session.resumeVersion || 0) + 1,
        resumeGeneratedAt: new Date().toISOString(),
      });
      setToastMessage('Instruction applied — preview updated.');
    } catch {
      setApiError({ type: 'network', message: 'Your internet connection dropped. Please check your connection.' });
    } finally {
      setSending(false);
    }
  }

  // ponytail: the structural-change Approve/Revert mechanism was removed along
  // with the docx safe-copy it depended on. structuralChanges now surface as
  // read-only informational items in the ActivityTile. If a per-change
  // accept/undo flow is wanted again, it can return here.

  function handleClearLog() {
    setSession({ ...session, log: [], warnings: [] });
  }

  async function handleDownload() {
    if (!tailoredStructure) return;
    const filename = `${sanitizeFilenameInput(filenameBase) || 'Resume'}.pdf`;
    try {
      const blob = await compileLatexToPdf(renderResumeLatex(tailoredStructure));
      downloadBlob(blob, filename);
      setToastMessage(`Downloaded — ${filename}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "We couldn't compile this resume to a PDF.";
      setPreviewError(message);
      setApiError({ type: 'generic', message: "We couldn't build the PDF for download. Please try again." });
    }
  }

  if (!session.complete) {
    return (
      <main className="min-h-screen px-6 py-8">
        <div className="mx-auto max-w-[1440px]">
          <Header active="review" title="Review your tailored resume" subtitle="No tailoring session yet." />
          <div className="resume-card p-10 text-center text-slate-300">
            <p>Complete a tailoring session from the Workspace tab first.</p>
            <a href="/" className="mt-4 inline-block rounded-full bg-accent px-6 py-3 text-sm font-semibold text-slate-950 hover:bg-blue-500">
              Go to Workspace
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 py-8">
      <div className="mx-auto max-w-[1440px]">
        <Header active="review" title="Review your tailored resume" subtitle="Read-only preview — changes are described in the AI Activity tile below." />

        {interruptedNotice ? (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            <span>Last session was interrupted. Please re-tailor.</span>
            <button
              type="button"
              onClick={() => setInterruptedNotice(false)}
              className="ml-auto text-slate-400 hover:text-slate-200"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="resume-card p-6 shadow-lg shadow-slate-950/10">
            <div className="mb-5 flex items-center justify-between gap-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Original</p>
              <p className="text-xs text-slate-400">Read-only · scroll to see full document</p>
            </div>
            <div className="h-[800px] overflow-auto rounded-2xl">
              <LatexPdfPreview latex={originalLatex} />
            </div>
          </section>

          <section className="relative resume-card p-6 shadow-lg shadow-slate-950/10">
            <div className="mb-5 flex items-center justify-between gap-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Tailored</p>
              <p className="text-xs text-slate-400">Read-only · scroll to see full document</p>
            </div>
            <div className="h-[800px] overflow-auto rounded-2xl">
              <LatexPdfPreview latex={tailoredLatex} onError={setPreviewError} />
            </div>

            {sending ? (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-3xl bg-slate-950/85">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-accent" />
                <p className="text-sm font-medium text-slate-200">Applying instruction...</p>
              </div>
            ) : null}
          </section>
        </div>
        {previewError ? <p className="mt-3 text-sm text-warning">{previewError}</p> : null}

        <div className="mt-6 flex flex-col gap-3 rounded-3xl border border-slate-800 bg-slate-950/90 p-6 shadow-xl shadow-slate-950/30">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex-1">
              <label className="text-xs text-slate-400">Filename</label>
              <div className="mt-2 flex items-center overflow-hidden rounded-2xl border border-slate-700 bg-slate-950">
                <input
                  value={filenameBase}
                  onChange={(event) => setFilenameBase(sanitizeFilenameInput(event.target.value))}
                  className="w-full bg-transparent px-4 py-3 text-white outline-none"
                />
                <span className="pr-4 text-slate-500">.pdf</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2">
                {session.resumeVersion > 0 ? (
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-400">
                    Version {session.resumeVersion}
                  </span>
                ) : null}
                <button
                  type="button"
                  className={`inline-flex items-center justify-center rounded-3xl bg-accent px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-blue-500${downloadPulse ? ' animate-download-pulse' : ''}`}
                  onClick={handleDownload}
                >
                  ✦ Download .pdf
                </button>
              </div>
              {relativeTime ? (
                <p className="text-xs text-slate-500">Generated: {relativeTime}</p>
              ) : null}
            </div>
          </div>
          <p className="text-xs text-slate-500">Describe any further edits in the AI Activity tile below — the preview and download update automatically.</p>
        </div>

        <ActivityTile
          matchScore={session.matchScore}
          missingRequirements={session.missingRequirements}
          estimatedPages={session.estimatedPages}
          vague={session.vague}
          vagueReason={session.vagueReason}
          vagueAcknowledged={session.vagueAcknowledged}
          onGoBack={() => router.push('/')}
          onProceedAnyway={() => setSession({ ...session, vagueAcknowledged: true })}
          log={session.log}
          structuralChanges={session.structuralChanges}
          usage={session.usage}
          warnings={session.warnings}
          debugInfo={debugInfo}
          onClear={handleClearLog}
          onSend={handleSendInstruction}
          sending={sending}
        />
      </div>

      {apiError ? (
        <Modal
          title="Something went wrong"
          message={apiError.message}
          actions={[{ label: 'Close', onClick: () => setApiError(null) }]}
        />
      ) : null}

      {toastMessage ? <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} /> : null}
    </main>
  );
}
