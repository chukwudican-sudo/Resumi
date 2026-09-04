'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The actual PDF, drawn onto a canvas by us.
 *
 * Not an <iframe>. Handing a PDF to the browser hands it the browser's viewer
 * too — a grey slab of chrome with its own padding that no stylesheet on this
 * page can reach, wrapped around a resume that is supposed to look like paper
 * sitting on a desk. And on iOS Safari an embedded PDF is not shown at all; it
 * offers a download instead, so the preview simply does not exist on most
 * phones.
 *
 * Rendering it ourselves costs a dependency and gives back full control of how
 * the page looks, on every device.
 */
export default function PdfPreview({
  applicationId,
  reloadKey,
}: {
  applicationId?: string;
  /** Change this to rebuild — after a tailor, or after polishing. */
  reloadKey?: string | number;
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<{ message: string }[]>([]);
  const [pages, setPages] = useState(0);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setState((s) => (s === 'ready' ? 'ready' : 'loading'));
    setError(null);
    setBlocking([]);

    async function draw() {
      const query = applicationId ? `?applicationId=${encodeURIComponent(applicationId)}` : '';
      const response = await fetch(`/api/resume/preview${query}`);

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (cancelled) return;
        setError(body?.error ?? `Preview unavailable (${response.status}).`);
        setBlocking(Array.isArray(body?.blocking) ? body.blocking : []);
        setState('error');
        return;
      }

      const bytes = await response.arrayBuffer();
      if (cancelled) return;

      // Imported here rather than at module scope: it is a large library that
      // only this component needs, and only once somebody opens a resume.
      // The legacy build, not the default one: pdf.js 6 ships syntax newer
      // than this Next version's bundler will parse, and the build fails on
      // the library rather than on anything we wrote.
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      // Served as a static file rather than bundled. Webpack emits a
      // `new URL(..., import.meta.url)` worker as an asset and then minifies
      // it as a plain script, which fails on the `import.meta` inside it — the
      // worker is a module and the browser loads it as one.
      // See scripts/copy-pdf-worker.mjs.
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

      const doc = await pdfjs.getDocument({ data: bytes }).promise;
      if (cancelled || !host.current) return;

      const width = host.current.clientWidth;
      const rendered: HTMLCanvasElement[] = [];

      for (let n = 1; n <= doc.numPages; n += 1) {
        const page = await doc.getPage(n);
        if (cancelled) return;

        // Drawn at the screen's real pixel density, or the text is soft on
        // every laptop made in the last decade.
        const ratio = window.devicePixelRatio || 1;
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (width / base.width) * ratio });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.className =
          'block rounded-[3px] border border-rule-field bg-white shadow-[0_2px_20px_rgba(26,24,21,0.06)]';

        const context = canvas.getContext('2d');
        if (!context) continue;
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        if (cancelled) return;
        rendered.push(canvas);
      }

      if (cancelled || !host.current) return;
      host.current.replaceChildren(...rendered);
      setPages(doc.numPages);
      setState('ready');
    }

    draw().catch(() => {
      if (cancelled) return;
      setError("We couldn't show this resume. It may still download correctly.");
      setState('error');
    });

    return () => {
      cancelled = true;
    };
  }, [applicationId, reloadKey]);

  if (state === 'error') {
    return (
      <div className="flex w-full max-w-[640px] flex-col items-center gap-3 rounded border border-rule-field bg-ground-surface px-8 py-16 text-center">
        <span className="text-[14px] text-ink">{error}</span>
        {blocking.length ? (
          <ul className="mt-1 flex flex-col gap-1.5 text-left">
            {blocking.map((b) => (
              <li key={b.message} className="text-[13px] leading-snug text-ink-prose">
                &bull; {b.message}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-[640px]">
      {/* Pages stack with a gap, the way sheets of paper do. */}
      <div ref={host} className="flex w-full flex-col gap-4" />

      {state === 'loading' ? (
        <div
          className={`absolute inset-0 flex items-center justify-center rounded ${
            pages ? 'bg-ground-band/60' : 'aspect-[8.5/11] border border-rule-field bg-ground-surface'
          }`}
        >
          <span className="text-[13px] text-ink-muted">
            {pages ? 'Rebuilding…' : 'Building your resume…'}
          </span>
        </div>
      ) : null}

      {state === 'ready' && pages > 1 ? (
        <div className="mt-3 text-center text-[12px] text-ink-faint">{pages} pages</div>
      ) : null}
    </div>
  );
}
