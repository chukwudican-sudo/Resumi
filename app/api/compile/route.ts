import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

// tectonic must run in Node (child_process), not the edge runtime.
export const runtime = 'nodejs';
// First compile on a fresh machine downloads tectonic's package bundle.
export const maxDuration = 60;

// Compile a LaTeX string to a PDF server-side via tectonic. Replaced the old
// in-browser SwiftLaTeX WASM engine once the client-only/offline requirement
// was dropped (see docs/adr/0003). tectonic resolves every package on its own,
// so nothing depends on the dead texlive2.swiftlatex.com server anymore.
export async function POST(req: NextRequest) {
  let latex: unknown;
  try {
    ({ latex } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof latex !== 'string' || !latex.trim()) {
    return NextResponse.json({ error: 'Missing "latex" string' }, { status: 400 });
  }

  const dir = await mkdtemp(join(tmpdir(), 'resumi-'));
  try {
    const tex = join(dir, 'main.tex');
    await writeFile(tex, latex, 'utf8');
    // ponytail: tectonic must be on PATH; TECTONIC_BIN overrides for odd installs.
    const bin = process.env.TECTONIC_BIN || 'tectonic';
    try {
      await run(bin, ['-X', 'compile', tex, '--outdir', dir, '--outfmt', 'pdf'], {
        cwd: dir,
        timeout: 55_000,
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (err) {
      // tectonic missing from PATH -> ENOENT: a config problem, not bad LaTeX.
      if ((err as { code?: string }).code === 'ENOENT') {
        return NextResponse.json(
          {
            error:
              `tectonic not found (tried "${bin}"). Install it and ensure it is on ` +
              `the server's PATH, or set TECTONIC_BIN to its absolute path.`,
          },
          { status: 500 },
        );
      }
      // tectonic writes the TeX error to stderr; surface it so the UI can show why.
      const log = (err as { stderr?: string }).stderr || String(err);
      return NextResponse.json({ error: 'LaTeX compilation failed', log }, { status: 422 });
    }
    const pdf = await readFile(join(dir, 'main.pdf'));
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdf.length),
      },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
