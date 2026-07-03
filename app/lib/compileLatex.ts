// Compiles a LaTeX string to a PDF by POSTing to the server-side /api/compile
// route (which shells out to tectonic). This replaced the in-browser SwiftLaTeX
// WASM engine once the client-only/offline requirement was dropped — see
// docs/adr/0003. The public API (compileLatexToPdf: string -> Blob) is unchanged,
// so callers didn't have to change.

/**
 * Compile a LaTeX source string to a PDF via the server.
 * @throws Error (with the tectonic log when available) if compilation fails.
 */
export async function compileLatexToPdf(latex: string): Promise<Blob> {
  const res = await fetch('/api/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latex }),
  });
  if (!res.ok) {
    let detail = `Compilation failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.log) detail = `LaTeX compilation failed:\n${body.log}`;
      else if (body?.error) detail = body.error;
    } catch {
      // non-JSON error body; keep the status-code fallback
    }
    throw new Error(detail);
  }
  return res.blob();
}
