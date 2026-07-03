# compileLatex self-check

The SwiftLaTeX engine is a Web Worker + WASM module. It needs a real browser
(`Worker`, same-origin `fetch` of `/swiftlatex/*`), so a Node unit test cannot
exercise it. Use this manual harness instead.

## Automated pre-check (runs in Node, no browser)

This does NOT compile — it only verifies the vendored assets and that the
CommonJS-patch-and-eval in `compileLatex.ts` works:

```bash
node -e '
const fs = require("fs");
const src = fs.readFileSync("public/swiftlatex/PdfTeXEngine.js","utf8");
const patched = src.replace(/var ENGINE_PATH = .swiftlatexpdftex\.js.;/, "var ENGINE_PATH = \x27/swiftlatex/swiftlatexpdftex.js\x27;");
if (patched === src) throw new Error("patch did not apply");
const mod = new Function("exports", patched + "\nreturn exports;")({});
if (typeof mod.PdfTeXEngine !== "function") throw new Error("no PdfTeXEngine");
const w = fs.readFileSync("public/swiftlatex/swiftlatexpdftex.wasm");
if (w.slice(0,4).toString("latin1") !== "\x00asm") throw new Error("bad wasm magic");
console.log("ok");
'
```

## Manual browser check (actually compiles)

1. Start the dev server: `npm run dev`.
2. Add a throwaway client page (delete it afterwards) at
   `app/latex-selfcheck/page.tsx`:

   ```tsx
   'use client';
   import { useEffect, useState } from 'react';
   import { compileLatexToPdf } from '../lib/compileLatex';

   export default function Page() {
     const [msg, setMsg] = useState('compiling…');
     useEffect(() => {
       compileLatexToPdf(
         '\\documentclass{article}\\begin{document}Hello\\end{document}',
       )
         .then(async (blob) => {
           const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
           const magic = String.fromCharCode(...head); // expect "%PDF"
           setMsg(magic === '%PDF' ? `PASS (${blob.size} bytes, ${magic})` : `FAIL: ${magic}`);
         })
         .catch((e) => setMsg('FAIL: ' + e.message));
     }, []);
     return <pre>{msg}</pre>;
   }
   ```

3. Open `http://localhost:3000/latex-selfcheck`. First load fetches the ~1.9 MB
   WASM/worker, so the first compile takes a few seconds.
4. Expect the page to render `PASS (<n> bytes, %PDF)`. The assertion is that the
   returned Blob's first four bytes are `%PDF`.
5. Delete `app/latex-selfcheck/` when done.
