'use client';

import { useRef, useState } from 'react';
import { fileToBase64 } from '../lib/fileToBase64';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * The largest file this can actually send.
 *
 * The platform refuses a request body over 4.5MB **before the handler runs**, and
 * base64 inflates a file by four thirds — so 3MB of PDF is already 4MB on the
 * wire and the ceiling is closer than it looks.
 *
 * Nothing checked this before. A 10MB scan was encoded, posted, refused by the
 * platform, and the failure landed in a catch that reports *"Make sure it isn't
 * password protected."* Scanned resumes are routinely 5–15MB, so those people met
 * that message every single time and were told the wrong thing about their own
 * file, forever.
 */
const MAX_BYTES = 3 * 1024 * 1024;

function readableSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(mb >= 10 ? 0 : 1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/** Where the upload has got to. `uploading` is the only measured part. */
export type UploadPhase = 'idle' | 'uploading' | 'reading' | 'done';

/**
 * Reading a resume file into the profile, wherever somebody offers to.
 *
 * A hook rather than a component: onboarding draws a 24px-padded card with a
 * badge, the setup rail draws one quiet line, and what they share is entirely
 * mechanism — the accepted types, the size check, the encode, the one request.
 * Sharing the mechanism is what stops the second one becoming a copy that drifts.
 *
 * Uploading REPLACES the whole profile — `replaceProfileFromResume` deletes every
 * entry, section and fact in one transaction — which is what `confirmBefore` is
 * for anywhere there is something to lose.
 */
export function useResumeUpload({
  onDone,
  confirmBefore,
}: {
  onDone: () => void;
  /** Asked before the file is read at all. Returning false abandons it. */
  confirmBefore?: () => Promise<boolean>;
}) {
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    // Both the declared type and the extension: a .docx dragged out of some mail
    // clients arrives as application/octet-stream.
    const name = file.name.toLowerCase();
    const mimeType =
      file.type === 'application/pdf' || name.endsWith('.pdf')
        ? 'application/pdf'
        : file.type === DOCX_MIME || name.endsWith('.docx')
          ? DOCX_MIME
          : null;

    if (!mimeType) {
      setError('Upload a PDF or Word (.docx) resume.');
      return;
    }

    // Before the encode, so a 12MB file is refused instantly rather than after
    // twenty seconds of reading it into memory and posting it.
    if (file.size > MAX_BYTES) {
      setError(
        `That file is ${readableSize(file.size)} and the limit is 3MB. A scanned resume is usually the reason — ` +
          'exporting a PDF from the original document instead of scanning a printout gets it well under.',
      );
      return;
    }

    if (confirmBefore && !(await confirmBefore())) return;

    setError(null);
    setPercent(0);
    setPhase('uploading');

    let base64: string;
    try {
      base64 = await fileToBase64(file);
    } catch {
      setPhase('idle');
      setError("We couldn't read that file. Make sure it isn't password protected.");
      return;
    }

    const body = JSON.stringify({ file: { base64, mimeType }, fileName: file.name });

    // XMLHttpRequest, not fetch, for one reason: `fetch` has no upload-progress
    // event and `xhr.upload.onprogress` does. Capped at 3MB the body is still
    // ~4MB, which on a slow uplink is around eighteen seconds before the model
    // call even begins — the stretch most likely to read as broken, and the only
    // stretch in this whole app whose progress is genuinely knowable.
    await new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/profile/import');
      xhr.setRequestHeader('Content-Type', 'application/json');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setPercent(Math.min(100, (e.loaded / e.total) * 100));
      };
      // The bytes are gone; everything after this is the model reading them.
      xhr.upload.onload = () => {
        setPercent(100);
        setPhase('reading');
      };

      xhr.onload = () => {
        let data: { error?: { message?: string } } | null = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          // A non-JSON body here is the platform answering, not the app.
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          setPhase('done');
          onDone();
        } else {
          setPhase('idle');
          setError(
            data?.error?.message ??
              (xhr.status === 413
                ? 'That file is too large to send. Resumes need to be under 3MB.'
                : "We couldn't read this as a resume. Try a different file."),
          );
        }
        resolve();
      };
      xhr.onerror = () => {
        setPhase('idle');
        setError('Your internet connection dropped. Check it and try again.');
        resolve();
      };

      xhr.send(body);
    });
  }

  return {
    /** Opens the file picker. Wire it to whatever the screen draws. */
    pick: () => inputRef.current?.click(),
    phase,
    /** True from the moment a file is chosen until the profile is written. */
    busy: phase === 'uploading' || phase === 'reading',
    /** 0–100 while the bytes are going up. Meaningless afterwards. */
    percent,
    error,
    clearError: () => setError(null),
    /**
     * Render this somewhere. The value clears on every change, so choosing the
     * same file again after a failure still fires.
     */
    input: (
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf,.docx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void handleFile(file);
        }}
      />
    ),
  };
}
