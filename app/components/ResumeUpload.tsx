'use client';

import { useRef, useState } from 'react';
import { fileToBase64 } from '../lib/fileToBase64';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Reading a resume file into the profile, wherever somebody offers to.
 *
 * A hook rather than a component, because the two places that need it look
 * nothing alike: onboarding presents a 26px-padded card with an icon and a
 * "about 30 seconds" badge, and the setup rail wants one quiet line under
 * "+ Add a section". What they share is entirely mechanism — the accepted
 * types, the base64 encode, the one POST, and which failures are worth
 * explaining. Sharing the mechanism and letting each screen draw its own button
 * is what keeps the second one from being a copy that drifts.
 *
 * Uploading REPLACES the whole profile — `replaceProfileFromResume` deletes
 * every entry, section and fact in one transaction. On onboarding there is
 * nothing to lose. Anywhere else there may be an afternoon of typing, which is
 * what `confirmBefore` is for.
 */
export function useResumeUpload({
  onDone,
  confirmBefore,
}: {
  /** After the profile has been replaced. Usually a refresh or a navigation. */
  onDone: () => void;
  /** Asked before the file is even read. Returning false abandons it. */
  confirmBefore?: () => Promise<boolean>;
}) {
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    // Both the declared type and the extension, because a .docx dragged out of
    // some mail clients arrives as application/octet-stream.
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

    // Before the encode, not after: the question is about what is on the
    // profile, and the answer does not depend on having read the file.
    if (confirmBefore && !(await confirmBefore())) return;

    setError(null);
    setParsing(true);
    try {
      const base64 = await fileToBase64(file);
      const response = await fetch('/api/profile/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: { base64, mimeType }, fileName: file.name }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error?.message ?? "We couldn't read this as a resume. Try a different file.");
        return;
      }
      onDone();
    } catch {
      setError("We couldn't read that file. Make sure it isn't password protected.");
    } finally {
      setParsing(false);
    }
  }

  return {
    /** Opens the file picker. Wire it to whatever the screen wants to draw. */
    pick: () => inputRef.current?.click(),
    parsing,
    error,
    clearError: () => setError(null),
    /**
     * Render this somewhere in the tree. The value is cleared on every change so
     * choosing the same file twice after a failure still fires.
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
