'use client';

import { useState } from 'react';
import ImageAttachPopup from './ImageAttachPopup';
import Modal from './Modal';
import { JobPostingImage, JobPostingState, emptyJobPosting } from '../lib/types';

interface JobPostingPanelProps {
  state: JobPostingState;
  onChange: (value: JobPostingState) => void;
}

function hasContent(state: JobPostingState): boolean {
  return state.description.trim().length > 0 || state.images.length > 0;
}

async function callExtractApi(images: JobPostingImage[], text: string) {
  const response = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'extract',
      images: images.map(({ base64, mimeType }) => ({ base64, mimeType })),
      text,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'Extraction failed.');
  }
  return data as { company: string; role: string; description: string };
}

export default function JobPostingPanel({ state, onChange }: JobPostingPanelProps) {
  const [popupOpen, setPopupOpen] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [reExtracting, setReExtracting] = useState(false);
  const [confirmingRemoveAll, setConfirmingRemoveAll] = useState(false);

  const showEmptyState = !state.extracted && state.images.length === 0 && !state.description.trim();

  async function handlePopupConfirm(newImages: JobPostingImage[]) {
    const mergedImages = [...state.images, ...newImages];

    if (!state.extracted) {
      // First-time attachment — extract immediately, popup stays open showing a spinner.
      setExtracting(true);
      setExtractError(null);
      try {
        const result = await callExtractApi(mergedImages, state.description);
        onChange({
          ...state,
          images: mergedImages,
          company: result.company,
          role: result.role,
          description: result.description || state.description,
          companyAutoDetected: Boolean(result.company),
          roleAutoDetected: Boolean(result.role),
          extracted: true,
          needsReExtraction: false,
          loaded: true,
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        setExtractError(error instanceof Error ? error.message : 'Extraction failed.');
        onChange({
          ...state,
          images: mergedImages,
          companyAutoDetected: false,
          roleAutoDetected: false,
          extracted: true,
          needsReExtraction: false,
          loaded: hasContent({ ...state, images: mergedImages }),
          updatedAt: new Date().toISOString(),
        });
      } finally {
        setExtracting(false);
        setPopupOpen(false);
      }
      return;
    }

    // Adding more images to an already-extracted posting — just attach, no auto re-extract.
    onChange({
      ...state,
      images: mergedImages,
      needsReExtraction: true,
      loaded: hasContent({ ...state, images: mergedImages }),
      updatedAt: new Date().toISOString(),
    });
    setPopupOpen(false);
  }

  async function handleReExtract() {
    setReExtracting(true);
    setExtractError(null);
    try {
      const result = await callExtractApi(state.images, state.description);
      onChange({
        ...state,
        company: result.company,
        role: result.role,
        description: result.description || state.description,
        companyAutoDetected: Boolean(result.company),
        roleAutoDetected: Boolean(result.role),
        needsReExtraction: false,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      setExtractError(error instanceof Error ? error.message : 'Extraction failed.');
    } finally {
      setReExtracting(false);
    }
  }

  function removeImage(id: string) {
    const nextImages = state.images.filter((image) => image.id !== id);
    if (nextImages.length === 0 && state.images.length > 0 && (state.extracted || state.company || state.role || state.description)) {
      setConfirmingRemoveAll(true);
      return;
    }
    onChange({ ...state, images: nextImages, loaded: hasContent({ ...state, images: nextImages }) });
  }

  return (
    <section className="resume-card p-6 shadow-lg shadow-slate-950/10">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Job Posting</p>
          <p className="mt-2 text-sm text-slate-300">
            Attach screenshots and/or paste the job description. At least one is needed before tailoring.
          </p>
        </div>
        <button
          type="button"
          className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
          onClick={() => onChange(emptyJobPosting)}
        >
          Clear
        </button>
      </div>

      <div className="space-y-4">
        {showEmptyState ? (
          <button
            type="button"
            onClick={() => setPopupOpen(true)}
            className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 hover:border-slate-500"
          >
            📷 Attach Job Posting Images
          </button>
        ) : (
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm text-slate-400">Screenshots</label>
              <div className="flex items-center gap-2">
                {state.needsReExtraction ? (
                  <button
                    type="button"
                    disabled={reExtracting}
                    onClick={handleReExtract}
                    className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {reExtracting ? 'Extracting...' : '↻ Re-extract info'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setPopupOpen(true)}
                  className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500"
                >
                  + Add more
                </button>
              </div>
            </div>
            {state.images.length > 0 ? (
              <div className="mt-3 space-y-2">
                {state.images.map((image) => (
                  <div key={image.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
                    <img
                      src={`data:${image.mimeType};base64,${image.base64}`}
                      alt={image.fileName}
                      className="h-8 w-8 rounded object-cover"
                    />
                    <p className="flex-1 truncate text-sm text-slate-300">📎 {image.fileName}</p>
                    <button
                      type="button"
                      onClick={() => removeImage(image.id)}
                      className="rounded-full px-2 text-slate-500 hover:text-slate-200"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">No screenshots attached.</p>
            )}
          </div>
        )}

        {!showEmptyState ? (
          <>
            <div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-400">Company</label>
                {state.companyAutoDetected ? (
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">✨ Auto-detected</span>
                ) : null}
              </div>
              <input
                value={state.company}
                onChange={(event) => onChange({ ...state, company: event.target.value, companyAutoDetected: false })}
                placeholder={state.extracted && !state.company ? "Couldn't detect — type here" : 'Company name'}
                className={`mt-2 w-full rounded-2xl border bg-slate-950 px-4 py-3 text-white outline-none transition hover:border-slate-500 ${
                  state.extracted && !state.company ? 'border-red-500' : 'border-slate-700'
                }`}
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-400">Role Title</label>
                {state.roleAutoDetected ? (
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">✨ Auto-detected</span>
                ) : null}
              </div>
              <input
                value={state.role}
                onChange={(event) => onChange({ ...state, role: event.target.value, roleAutoDetected: false })}
                placeholder={state.extracted && !state.role ? "Couldn't detect — type here" : 'Role title'}
                className={`mt-2 w-full rounded-2xl border bg-slate-950 px-4 py-3 text-white outline-none transition hover:border-slate-500 ${
                  state.extracted && !state.role ? 'border-red-500' : 'border-slate-700'
                }`}
              />
            </div>
          </>
        ) : null}

        <div>
          <label className="text-sm text-slate-400">Job Description</label>
          <textarea
            value={state.description}
            onChange={(event) => {
              const description = event.target.value;
              onChange({ ...state, description, loaded: hasContent({ ...state, description }), updatedAt: new Date().toISOString() });
            }}
            placeholder={
              state.extracted && !state.description ? "Couldn't detect — paste here" : 'Or paste job description text here...'
            }
            rows={6}
            className={`mt-2 w-full rounded-3xl border bg-slate-950 px-4 py-3 text-white outline-none transition hover:border-slate-500 ${
              state.extracted && !state.description ? 'border-red-500' : 'border-slate-700'
            }`}
          />
        </div>

        {extractError ? <p className="text-sm text-warning">Couldn't read the job posting: {extractError}</p> : null}
      </div>

      {popupOpen ? <ImageAttachPopup onClose={() => setPopupOpen(false)} onConfirm={handlePopupConfirm} /> : null}

      {extracting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-6">
          <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl shadow-slate-950/50">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-accent" />
            <p className="text-sm text-slate-200">Extracting job info...</p>
          </div>
        </div>
      ) : null}

      {confirmingRemoveAll ? (
        <Modal
          title="Remove all images and clear extracted info?"
          message="This will clear the attached screenshots, company, role, and description."
          actions={[
            { label: 'Cancel', onClick: () => setConfirmingRemoveAll(false) },
            {
              label: 'Confirm',
              variant: 'primary',
              onClick: () => {
                setConfirmingRemoveAll(false);
                onChange(emptyJobPosting);
              },
            },
          ]}
        />
      ) : null}
    </section>
  );
}
