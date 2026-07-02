'use client';

import { useRef, useState } from 'react';
import { fileToBase64 } from '../lib/fileToBase64';
import { JobPostingImage } from '../lib/types';

const MAX_BYTES = 4 * 1024 * 1024;

interface RejectedFile {
  fileName: string;
  reason: string;
}

interface ImageAttachPopupProps {
  onClose: () => void;
  onConfirm: (images: JobPostingImage[]) => void;
}

export default function ImageAttachPopup({ onClose, onConfirm }: ImageAttachPopupProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pending, setPending] = useState<JobPostingImage[]>([]);
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);

  async function addFiles(files: File[]) {
const nextRejected: RejectedFile[] = [];
    const accepted: File[] = [];

    for (const file of files) {
      if (file.type !== 'image/jpeg' && file.type !== 'image/png') {
        nextRejected.push({ fileName: file.name, reason: 'Only JPG and PNG screenshots are supported.' });
        continue;
      }
      if (file.size > MAX_BYTES) {
        nextRejected.push({ fileName: file.name, reason: 'This image is too large. Please use a lower resolution screenshot.' });
        continue;
      }
      accepted.push(file);
    }

    if (nextRejected.length > 0) {
      setRejected((prev) => [...prev, ...nextRejected]);
    }

    if (accepted.length > 0) {
      const newImages: JobPostingImage[] = await Promise.all(
        accepted.map(async (file) => ({
          id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
          fileName: file.name,
          base64: await fileToBase64(file),
          mimeType: file.type,
        })),
      );
      setPending((prev) => [...prev, ...newImages]);
    }
  }

  function removePending(id: string) {
    setPending((prev) => prev.filter((image) => image.id !== id));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-6">
      <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-slate-950/50">
        <h2 className="text-lg font-semibold text-white">Attach Job Posting Screenshots</h2>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            addFiles(Array.from(event.dataTransfer.files));
          }}
          className={`mt-4 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${
            dragOver ? 'border-accent bg-accent/10' : 'border-slate-700'
          }`}
        >
          <p className="text-sm text-slate-400">Drag and drop screenshots here</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
          >
            Browse files
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = '';
              if (files.length === 0) return;
              addFiles(files);
            }}
          />
        </div>

        {pending.length > 0 || rejected.length > 0 ? (
          <div className="mt-4 max-h-48 space-y-2 overflow-y-auto">
            {pending.map((image) => (
              <div key={image.id} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
                <img
                  src={`data:${image.mimeType};base64,${image.base64}`}
                  alt={image.fileName}
                  className="h-10 w-10 rounded object-cover"
                />
                <p className="flex-1 truncate text-sm text-slate-300">{image.fileName}</p>
                <button
                  type="button"
                  onClick={() => removePending(image.id)}
                  className="rounded-full px-2 text-slate-500 hover:text-slate-200"
                >
                  ✕
                </button>
              </div>
            ))}
            {rejected.map((file, index) => (
              <div key={`${file.fileName}-${index}`} className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2">
                <p className="text-sm text-slate-300">{file.fileName}</p>
                <p className="text-xs text-warning">{file.reason}</p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-700 bg-slate-900 px-5 py-2 text-sm text-slate-200 hover:border-slate-500"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending.length === 0}
            onClick={() => onConfirm(pending)}
            className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            Okay
          </button>
        </div>
      </div>
    </div>
  );
}
