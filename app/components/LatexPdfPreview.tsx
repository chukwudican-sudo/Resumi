'use client';

import { useEffect, useRef, useState } from 'react';
import { compileLatexToPdf } from '../lib/compileLatex';

interface LatexPdfPreviewProps {
  latex: string;
  onError?: (message: string) => void;
}

// Compiles the given LaTeX to a PDF in the browser (via the vendored SwiftLaTeX
// WASM engine) and shows it in an <iframe>. Recompiles on `latex` change,
// debounced so keystroke-by-keystroke edits don't thrash the engine.
export default function LatexPdfPreview({ latex, onError }: LatexPdfPreviewProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Keep the current object URL in a ref so cleanup can revoke it without
  // re-running the effect when the URL state changes.
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!latex) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const timer = setTimeout(() => {
      compileLatexToPdf(latex)
        .then((blob) => {
          if (cancelled) return;
          const nextUrl = URL.createObjectURL(blob);
          // Revoke the previous PDF before swapping in the new one.
          if (urlRef.current) URL.revokeObjectURL(urlRef.current);
          urlRef.current = nextUrl;
          setUrl(nextUrl);
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          const message =
            err instanceof Error ? err.message : "We couldn't compile this LaTeX document.";
          setError(message);
          setLoading(false);
          onError?.(message);
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latex]);

  // Revoke the last object URL on unmount.
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  return (
    <div className="relative h-full">
      {url ? (
        <iframe src={url} title="LaTeX PDF preview" className="w-full h-full" />
      ) : null}
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
          Compiling…
        </div>
      ) : null}
      {error && !loading ? (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-red-500">
          {error}
        </div>
      ) : null}
    </div>
  );
}
