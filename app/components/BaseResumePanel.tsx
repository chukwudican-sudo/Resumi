'use client';

import { useRef, useState } from 'react';
import Modal from './Modal';
import { fileToBase64 } from '../lib/fileToBase64';
import { BaseResumeState, ResumeStructure, emptyBaseResume } from '../lib/types';

interface BaseResumePanelProps {
  state: BaseResumeState;
  onUpload: (state: BaseResumeState) => void;
  onStructureExtracted: (structure: ResumeStructure | null) => void;
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function fileMimeType(file: File): string | null {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'application/pdf';
  if (file.type === DOCX_MIME || name.endsWith('.docx')) return DOCX_MIME;
  return null;
}

export default function BaseResumePanel({ state, onUpload, onStructureExtracted }: BaseResumePanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [structure, setStructure] = useState<ResumeStructure | null>(null);
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  async function handleFile(file: File) {
    const mimeType = fileMimeType(file);
    if (!mimeType) {
      setErrorMessage("We couldn't read this file. Upload a PDF or Word (.docx) resume with no password protection.");
      return;
    }
    setErrorMessage(null);
    setParsing(true);
    try {
      const base64 = await fileToBase64(file);
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'extract_resume', file: { base64, mimeType } }),
      });
      const data = await response.json();

      if (!response.ok) {
        const message =
          data?.error?.message || "We couldn't read this file as a resume. Try a different PDF or .docx.";
        setErrorMessage(message);
        return;
      }

      const parsed = data.structure as ResumeStructure;
      setStructure(parsed);
      onStructureExtracted(parsed);
      onUpload({
        loaded: true,
        fileName: file.name,
        updatedAt: new Date().toISOString(),
        warning: null,
      });
    } catch {
      setErrorMessage("We couldn't read your resume file. Make sure it's a standard PDF or .docx with no password protection.");
    } finally {
      setParsing(false);
    }
  }

  function openPicker() {
    if (state.loaded) {
      setConfirmingReplace(true);
      return;
    }
    fileInputRef.current?.click();
  }

  return (
    <section className="resume-card p-6 shadow-lg shadow-slate-950/10">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Source Resume</p>
          <p className="mt-2 text-sm text-slate-300">
            Upload your resume as a content source. Its formatting is discarded — the app re-renders your content into
            one canonical layout.
          </p>
        </div>
        <button
          type="button"
          className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-50"
          onClick={openPicker}
          disabled={parsing}
        >
          {state.loaded ? 'Replace' : 'Upload'}
        </button>
      </div>

      {parsing ? (
        <p className="rounded-2xl border border-dashed border-slate-700 px-4 py-6 text-center text-slate-400">
          Reading your resume…
        </p>
      ) : state.loaded ? (
        <div className="space-y-3 text-sm text-slate-300">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">{state.fileName} — Parsed</p>
            <button
              type="button"
              onClick={() => setConfirmingRemove(true)}
              className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300 hover:border-warning hover:text-warning"
            >
              Remove
            </button>
          </div>
          <p>Updated: {new Date(state.updatedAt).toLocaleDateString()}</p>
          {structure ? (
            <p className="rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-slate-300">
              Parsed: {structure.experience.length} experience{' '}
              {structure.experience.length === 1 ? 'entry' : 'entries'}, {structure.projects.length}{' '}
              {structure.projects.length === 1 ? 'project' : 'projects'}, {structure.education.length}{' '}
              {structure.education.length === 1 ? 'education entry' : 'education entries'}
              {structure.skills.length > 0 ? ', skills ✓' : ''}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-700 px-4 py-6 text-center text-slate-400">
          Upload your resume as a PDF or .docx Word file. We read the content — the layout is regenerated for you.
        </p>
      )}

      <p className="mt-5 text-xs text-slate-500">
        Only your content is used. The uploaded file&apos;s original formatting is never preserved.
      </p>
      {errorMessage ? <p className="mt-3 text-sm text-warning">{errorMessage}</p> : null}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          handleFile(file);
        }}
      />

      {confirmingReplace ? (
        <Modal
          title="Replace source resume?"
          message="Replacing your source resume will affect the next tailoring session. Continue?"
          actions={[
            { label: 'Cancel', onClick: () => setConfirmingReplace(false) },
            {
              label: 'Continue',
              variant: 'primary',
              onClick: () => {
                setConfirmingReplace(false);
                fileInputRef.current?.click();
              },
            },
          ]}
        />
      ) : null}

      {confirmingRemove ? (
        <Modal
          title="Remove your source resume?"
          message="This is needed to tailor."
          actions={[
            { label: 'Cancel', onClick: () => setConfirmingRemove(false) },
            {
              label: 'Remove',
              variant: 'primary',
              onClick: () => {
                setConfirmingRemove(false);
                setStructure(null);
                onStructureExtracted(null);
                onUpload(emptyBaseResume);
              },
            },
          ]}
        />
      ) : null}
    </section>
  );
}
