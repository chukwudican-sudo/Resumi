// Client-only: compiles a LaTeX string to a PDF entirely in the browser using
// the vendored SwiftLaTeX PdfTeXEngine (see public/swiftlatex/). Nothing leaves
// the browser — this upholds the app's privacy model (ADR 0003).
//
// This module MUST only be imported from 'use client' components. It touches
// `window`/`Worker` lazily (inside the exported async function), so merely
// importing it does not break SSR — but the engine only exists in the browser.
//
// ponytail: CEILING — if the ~1.9 MB WASM/worker first-load or first-compile
// latency proves too heavy for the target device, ADR 0003's *rejected* hosted
// LaTeX-compile API is the documented upgrade path. Don't reach for it unless
// the WASM route is measured and found wanting; it trades away the privacy
// guarantee (the resume text would leave the browser).

// The vendored PdfTeXEngine.js is a plain CommonJS-style script (it assigns to a
// local `exports` object) and its ENGINE_PATH for the worker is *relative to the
// page*, which breaks once the engine lives under /swiftlatex/. Rather than add a
// build step or a bundler loader, we fetch the source, rewrite ENGINE_PATH to an
// absolute URL, and evaluate it to pull out the class. The worker then loads its
// own swiftlatexpdftex.wasm relative to itself, so both stay under /swiftlatex/.
const ENGINE_DIR = '/swiftlatex';

// Minimal shape of the SwiftLaTeX PdfTeXEngine we depend on.
interface CompileResult {
  pdf?: Uint8Array;
  status: number;
  log: string;
}
interface PdfTeXEngine {
  loadEngine(): Promise<void>;
  isReady(): boolean;
  writeMemFSFile(filename: string, srccode: string): void;
  setEngineMainFile(filename: string): void;
  compileLaTeX(): Promise<CompileResult>;
}
interface PdfTeXEngineCtor {
  new (): PdfTeXEngine;
}

// Module-level singletons so the ~1.9 MB engine loads once per page, not per compile.
let engineCtorPromise: Promise<PdfTeXEngineCtor> | null = null;
let enginePromise: Promise<PdfTeXEngine> | null = null;

async function loadEngineCtor(): Promise<PdfTeXEngineCtor> {
  if (engineCtorPromise) return engineCtorPromise;
  engineCtorPromise = (async () => {
    const src = await fetch(`${ENGINE_DIR}/PdfTeXEngine.js`).then((r) => {
      if (!r.ok) throw new Error(`Failed to load PdfTeXEngine.js (${r.status})`);
      return r.text();
    });
    // Point the worker at the absolute vendored path instead of the page-relative default.
    const patched = src.replace(
      /var ENGINE_PATH = 'swiftlatexpdftex\.js';/,
      `var ENGINE_PATH = '${ENGINE_DIR}/swiftlatexpdftex.js';`,
    );
    // Evaluate the CommonJS-style script in an isolated scope and hand back its `exports`.
    const factory = new Function('exports', `${patched}\nreturn exports;`);
    const mod = factory({}) as { PdfTeXEngine: PdfTeXEngineCtor };
    if (!mod?.PdfTeXEngine) throw new Error('PdfTeXEngine not found in vendored engine');
    return mod.PdfTeXEngine;
  })();
  return engineCtorPromise;
}

async function getEngine(): Promise<PdfTeXEngine> {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    const Ctor = await loadEngineCtor();
    const engine = new Ctor();
    await engine.loadEngine();
    return engine;
  })();
  try {
    return await enginePromise;
  } catch (err) {
    // Let a failed init be retried on the next call instead of caching the rejection.
    enginePromise = null;
    throw err;
  }
}

/**
 * Compile a LaTeX source string to a PDF, entirely in the browser.
 * @throws Error (with the TeX compile log) if compilation fails.
 */
export async function compileLatexToPdf(latex: string): Promise<Blob> {
  const engine = await getEngine();
  engine.writeMemFSFile('main.tex', latex);
  engine.setEngineMainFile('main.tex');
  const result = await engine.compileLaTeX();
  if (!result.pdf || result.status !== 0) {
    throw new Error(`LaTeX compilation failed (status ${result.status}):\n${result.log}`);
  }
  // Copy into a fresh, ArrayBuffer-backed Uint8Array so it is an unambiguous
  // BlobPart (the engine's array may be typed against SharedArrayBuffer).
  return new Blob([new Uint8Array(result.pdf)], { type: 'application/pdf' });
}
