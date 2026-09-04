import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Puts pdf.js's worker where the browser can fetch it.
 *
 * The worker cannot go through the bundler. Referencing it with
 * `new URL(..., import.meta.url)` makes webpack emit it as an asset and then
 * minify it as a plain script, which fails on the `import.meta` inside it —
 * it is a module, and it is only ever loaded as one, by the browser.
 *
 * Copied on install rather than committed, so it cannot drift from the version
 * of pdfjs-dist actually installed.
 */
const here = dirname(fileURLToPath(import.meta.url));
const from = join(here, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs');
const to = join(here, '..', 'public', 'pdf.worker.min.mjs');

mkdirSync(dirname(to), { recursive: true });
copyFileSync(from, to);
console.log('[resumi] pdf.js worker copied to public/');
