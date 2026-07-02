'use client';

import { useRef, useState } from 'react';
import Modal from './Modal';
import DocxPreview from './DocxPreview';
import { fileToBase64 } from '../lib/fileToBase64';
import { BaseResumeState, emptyBaseResume } from '../lib/types';

interface BaseResumePanelProps {
  state: BaseResumeState;
  onUpload: (state: BaseResumeState) => void;
}

const SECTION_KEYWORDS = ['experience', 'education', 'skills', 'projects', 'summary', 'certifications'];

function detectSections(text: string): boolean {
  const lower = text.toLowerCase();
  return SECTION_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export default function BaseResumePanel({ state, onUpload }: BaseResumePanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setErrorMessage("We couldn't read this file. Make sure it's a standard .docx with no password protection.");
      return;
    }
    try {
      setErrorMessage(null);
      const base64 = await fileToBase64(file);
      onUpload({
        loaded: true,
        fileName: file.name,
        updatedAt: new Date().toISOString(),
        base64,
        warning: null,
      });
    } catch {
      setErrorMessage("We couldn't read your resume file. Make sure it's a standard .docx with no password protection.");
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
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Base Resume</p>
          <p className="mt-2 text-sm text-slate-300">
            This is the formatting and structural reference — defines layout, section order, bullet style, spacing.
          </p>
        </div>
        <button
          type="button"
          className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
          onClick={openPicker}
        >
          {state.loaded ? 'Replace' : 'Upload'}
        </button>
      </div>

      {state.loaded ? (
        <div className="space-y-3 text-sm text-slate-300">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">{state.fileName} — Loaded</p>
            <button
              type="button"
              onClick={() => setConfirmingRemove(true)}
              className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300 hover:border-warning hover:text-warning"
            >
              Remove
            </button>
          </div>
          <p>Updated: {new Date(state.updatedAt).toLocaleDateString()}</p>
          <div className="mt-3 h-48 overflow-hidden rounded-2xl border border-slate-800">
            <DocxPreview
              base64={state.base64}
              onRendered={(text) => {
                const sectionsFound = detectSections(text);
                const nextWarning = sectionsFound
                  ? null
                  : "We couldn't detect standard resume sections. Your formatting may not render correctly. Make sure your resume uses standard Word styles.";
                if (nextWarning !== state.warning) {
                  onUpload({ ...state, warning: nextWarning });
                }
              }}
              onError={(message) => setErrorMessage(message)}
            />
          </div>
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-700 px-4 py-6 text-center text-slate-400">
          Upload your resume as a .docx Word file. Use a plain single-column layout with standard Word styles for best
          results.
        </p>
      )}

      <p className="mt-5 text-xs text-slate-500">The AI only ever edits text inside your existing Word styles — fonts, margins, and spacing never change.</p>
      {state.warning ? <p className="mt-3 text-sm text-warning">{state.warning}</p> : null}
      {errorMessage ? <p className="mt-3 text-sm text-warning">{errorMessage}</p> : null}

      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
          title="Replace base resume?"
          message="Replacing your base resume will affect the next tailoring session. Continue?"
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
          title="Remove your base resume?"
          message="This is needed to tailor."
          actions={[
            { label: 'Cancel', onClick: () => setConfirmingRemove(false) },
            {
              label: 'Remove',
              variant: 'primary',
              onClick: () => {
                setConfirmingRemove(false);
                onUpload(emptyBaseResume);
              },
            },
          ]}
        />
      ) : null}
    </section>
  );
}
