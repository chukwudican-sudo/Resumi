'use client';

import { useRef, useState } from 'react';
import { fileToBase64 } from '../lib/fileToBase64';
import { DocumentFileState, emptyDocumentFile } from '../lib/types';

interface WorkspacePanelProps {
  title: string;
  hint: string;
  tooltip: string;
  ruleNote: string;
  state: DocumentFileState;
  onUpload: (state: DocumentFileState) => void;
  optional?: boolean;
}

export default function WorkspacePanel({ title, hint, tooltip, ruleNote, state, onUpload, optional }: WorkspacePanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleFile(file: File) {
    if (file.type !== 'application/pdf') {
      setErrorMessage('Please upload a PDF file.');
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
        mimeType: file.type,
      });
    } catch {
      setErrorMessage("We couldn't read this file. Make sure it's a standard PDF with no password protection.");
    }
  }

  return (
    <section className="resume-card p-6 shadow-lg shadow-slate-950/10">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            {title}
            {optional ? <span className="text-slate-600"> (Optional)</span> : null}
          </p>
          <p className="mt-2 text-sm text-slate-300">{tooltip}</p>
        </div>
        <button
          type="button"
          className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
          onClick={() => fileInputRef.current?.click()}
        >
          {state.loaded ? 'Replace' : 'Upload'}
        </button>
      </div>

      {state.loaded ? (
        <div className="space-y-2 text-sm text-slate-300">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">{state.fileName} — Loaded</p>
            <button
              type="button"
              onClick={() => {
                onUpload(emptyDocumentFile);
                setErrorMessage(null);
              }}
              title="Remove"
              className="rounded-full px-2 text-slate-500 hover:text-warning"
            >
              ✕
            </button>
          </div>
          <p>Updated: {new Date(state.updatedAt).toLocaleDateString()}</p>
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-700 px-4 py-6 text-center text-slate-400">{hint}</p>
      )}

      <p className="mt-5 text-xs text-slate-500">{ruleNote}</p>
      {errorMessage ? <p className="mt-3 text-sm text-warning">{errorMessage}</p> : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          handleFile(file);
        }}
      />
    </section>
  );
}
