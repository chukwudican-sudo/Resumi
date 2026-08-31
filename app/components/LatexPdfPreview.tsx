'use client';

import { useEffect, useRef, useState } from 'react';
import { compileLatexToPdf } from '../lib/compileLatex';

interface LatexPdfPreviewProps {
  latex: string;
  onError?: (message: string) => void;
}

// POSTs the given LaTeX to /api/compile (which shells out to Tectonic server-side
// and returns a PDF blob), then shows the result in an <iframe>.
// Recompiles on `latex` change, debounced to avoid hammering the server.
export default function LatexPdfPreview({ latex, onError }: LatexPdfPreviewProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  // False until the first successful compile completes. Drives the one-time
  // "packages downloading" hint shown under the spinner.
  const [tectonicReady, setTectonicReady] = useState(() => {
    try { return localStorage.getItem('resumi-tectonic-ready') === 'true'; } catch { return false; }
  });

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
          if (urlRef.current) URL.revokeObjectURL(urlRef.current);
          urlRef.current = nextUrl;
          setUrl(nextUrl);
          setLoading(false);
          if (!tectonicReady) {
            try { localStorage.setItem('resumi-tectonic-ready', 'true'); } catch {}
            setTectonicReady(true);
          }
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
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-500">
          <span>Compiling…</span>
          {!tectonicReady ? (
            <span className="max-w-xs text-xs text-slate-600">
              First compile may take 30–60 seconds while required packages download. This only happens once.
            </span>
          ) : null}
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
