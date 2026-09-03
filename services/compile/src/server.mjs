import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { timingSafeEqual } from 'node:crypto';

const run = promisify(execFile);

/**
 * Turns LaTeX into a PDF, and does nothing else.
 *
 * Deliberately tiny and dependency-free. This container runs a TeX engine,
 * which is a programming language with filesystem access, so the useful
 * security question is not "is the code correct" but "what is reachable if it
 * is not". The answer is kept small: no database credentials, no user data, no
 * API keys, no outbound network at compile time, and a filesystem that holds
 * only the LaTeX bundle and this file.
 *
 * The LaTeX it receives is always produced by the app's own renderer from a
 * stored resume — never accepted from a browser. The token below is what keeps
 * that true in practice.
 */

const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.COMPILE_TOKEN;
const TIMEOUT_MS = Number(process.env.COMPILE_TIMEOUT_MS || 15_000);
const MAX_BODY = 512 * 1024;

if (!TOKEN) {
  console.error('COMPILE_TOKEN is not set. Refusing to start an unauthenticated compile service.');
  process.exit(1);
}

/** Compared in constant time so the token cannot be recovered by timing. */
function authorised(header) {
  const given = (header || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(given);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

// One compile at a time per machine. Unbounded concurrency turns a slow
// document into a memory problem, and a resume takes about a second.
let inFlight = 0;
const MAX_IN_FLIGHT = Number(process.env.COMPILE_CONCURRENCY || 2);

async function compile(latex) {
  const dir = await mkdtemp(join(tmpdir(), 'compile-'));
  try {
    const tex = join(dir, 'main.tex');
    await writeFile(tex, latex, 'utf8');
    await run('tectonic', ['-X', 'compile', tex, '--outdir', dir, '--outfmt', 'pdf'], {
      cwd: dir,
      timeout: TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
      // The bundle is baked into the image, so a compile needs no network. If
      // tectonic reaches for one anyway, something is wrong with the image.
      env: { ...process.env, HOME: process.env.HOME || '/home/app' },
    });
    return await readFile(join(dir, 'main.pdf'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const server = createServer((req, res) => {
  const json = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  if (req.method === 'GET' && req.url === '/health') return json(200, { status: 'ok' });

  if (req.method !== 'POST' || req.url !== '/render') return json(404, { error: 'Not found' });
  if (!authorised(req.headers.authorization)) return json(401, { error: 'Unauthorized' });
  if (inFlight >= MAX_IN_FLIGHT) return json(503, { error: 'Busy' });

  let size = 0;
  const chunks = [];
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY) {
      json(413, { error: 'Too large' });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', async () => {
    if (res.writableEnded) return;

    let latex;
    try {
      ({ latex } = JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch {
      return json(400, { error: 'Invalid JSON' });
    }
    if (typeof latex !== 'string' || !latex.trim()) return json(400, { error: 'Missing "latex"' });

    inFlight += 1;
    try {
      const pdf = await compile(latex);
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': String(pdf.length) });
      res.end(pdf);
    } catch (err) {
      // The log stays here; the caller gets a status. A TeX trace is internal.
      console.error('[compile] failed:', err.stderr || err.message);
      json(422, { error: 'Compilation failed' });
    } finally {
      inFlight -= 1;
    }
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`compile service listening on ${PORT}`));
