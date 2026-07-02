'use client';

import { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { base64ToBlob } from '../lib/base64';

interface DocxPreviewProps {
  base64: string;
  onRendered?: (plainText: string) => void;
  onError?: (message: string) => void;
}

export default function DocxPreview({ base64, onRendered, onError }: DocxPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container || !base64) return;

    setLoading(true);
    container.innerHTML = '';

    renderAsync(base64ToBlob(base64), container, undefined, {
      className: 'docx-preview',
      inWrapper: true,
      ignoreLastRenderedPageBreak: true,
    })
      .then(() => {
        if (cancelled) return;
        setLoading(false);

        // Scale the rendered Word document to fit the container's client width.
        // docx-preview renders at the document's natural page width (~816px for
        // US Letter), which often exceeds the panel. CSS zoom shrinks both the
        // visual size and the layout box together, eliminating horizontal overflow
        // and the right-side clipping. It also naturally reduces the height so
        // the vertical scroll shows the full document at the right scale.
        const wrapper = container.querySelector<HTMLElement>('.docx-preview');
        if (wrapper && container.clientWidth > 0 && wrapper.scrollWidth > container.clientWidth) {
          const scale = container.clientWidth / wrapper.scrollWidth;
          // zoom is not in TypeScript's CSSStyleDeclaration but is supported in
          // all modern browsers (Chrome, Safari, Firefox 126+, Edge).
          (wrapper.style as CSSStyleDeclaration & { zoom: string }).zoom = String(scale);
        }

        onRendered?.(container.textContent || '');
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        onError?.("We couldn't render this .docx file. Make sure it's a standard Word document with no password protection.");
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base64]);

  return (
    <div className="relative h-full">
      {loading ? <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">Loading preview...</div> : null}
      <div ref={containerRef} className="docx-preview-container h-full" />
    </div>
  );
}
