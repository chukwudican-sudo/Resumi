import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * How long a compile is allowed, everywhere.
 *
 * There were four numbers and they disagreed: this caller aborted at 30s, the
 * deployed service kills tectonic at 15s, the platform allows 60s, and the local
 * path allowed 55s. The tightest wins, so the real ceiling was always 15s — and
 * because local was nearly four times more forgiving, a resume that took twenty
 * seconds compiled fine on the machine it was tested on and failed for everyone
 * else. Matches COMPILE_TIMEOUT_MS in services/compile.
 */
const COMPILE_LIMIT_MS = Number(process.env.COMPILE_TIMEOUT_MS || 15_000);

/**
 * Runs tectonic over LaTeX this server generated.
 *
 * Deliberately not exported anywhere a request body can reach. The one rule
 * that makes the whole compile path safe is that the LaTeX handed to this
 * function is always produced by `renderResumeLatex` from a stored structure —
 * never accepted from a client. TeX is a full programming language with file
 * access: `\input{/etc/passwd}` renders the file into the PDF, and
 * `\def\x{\x}\x` runs until the timeout. Escaping cannot fix that, because the
 * problem is not badly-escaped text, it is that the caller controls commands
 * at all. So the caller does not.
 */
export class LatexCompileError extends Error {
  constructor(message: string, readonly log: string, readonly kind: 'config' | 'latex' | 'busy') {
    super(message);
    this.name = 'LatexCompileError';
  }
}

/**
 * Sends the LaTeX to the compile service, when there is one.
 *
 * Vercel's functions have no TeX installation and no way to get one, so in a
 * deployed app this is the only path that works. Locally both variables are
 * unset and the local binary is used instead, which is what lets development
 * work without deploying anything.
 */
async function compileRemotely(latex: string, url: string, token: string): Promise<Buffer> {
  const response = await fetch(`${url.replace(/\/+$/, '')}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ latex }),
    // Above COMPILE_LIMIT_MS, deliberately: the service's own timeout should win
    // the race so its error reaches the person, rather than an abort here that
    // says nothing about why.
    signal: AbortSignal.timeout(COMPILE_LIMIT_MS + 5_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    // 503 is the service saying it already has two compiles in flight — one
    // machine, two slots, no queue. It was reported to the person as
    // "We couldn't build that PDF. This one is on us — it has been logged.",
    // which is a permanent-sounding message for something a retry fixes. Three
    // people downloading at once is not exotic.
    const kind =
      response.status === 503
        ? 'busy'
        : response.status === 401 || response.status === 404
          ? 'config'
          : 'latex';
    throw new LatexCompileError(`Compile service returned ${response.status}`, detail, kind);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function compileToPdf(latex: string): Promise<Buffer> {
  const url = process.env.COMPILE_SERVICE_URL;
  const token = process.env.COMPILE_TOKEN;

  if (url && token) return compileRemotely(latex, url, token);

  if (url || token) {
    // Half-configured is worse than unconfigured: it would silently fall back
    // to a local binary that production does not have, and the failure would
    // surface as a missing PDF rather than as the misconfiguration it is.
    throw new LatexCompileError(
      'COMPILE_SERVICE_URL and COMPILE_TOKEN must both be set, or neither.',
      '',
      'config',
    );
  }

  return compileLocally(latex);
}

/** The development path: the binary on this machine. */
async function compileLocally(latex: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'resumi-'));
  try {
    const tex = join(dir, 'main.tex');
    await writeFile(tex, latex, 'utf8');

    // tectonic must be on PATH; TECTONIC_BIN overrides for odd installs.
    const bin = process.env.TECTONIC_BIN || 'tectonic';
    try {
      await run(bin, ['-X', 'compile', tex, '--outdir', dir, '--outfmt', 'pdf'], {
        cwd: dir,
        // The same ceiling as production, not a longer one.
      //
      // This was 55s while the deployed service kills tectonic at 15s — so a
      // resume taking twenty seconds passed every local test and failed for
      // every real user, with a message claiming it was our bug.
      timeout: COMPILE_LIMIT_MS,
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (err) {
      if ((err as { code?: string }).code === 'ENOENT') {
        throw new LatexCompileError(
          `tectonic not found (tried "${bin}"). Install it and ensure it is on the ` +
            `server's PATH, or set TECTONIC_BIN to its absolute path.`,
          '',
          'config',
        );
      }
      // A failure here is our renderer's bug, not the user's input — they never
      // supplied LaTeX. The log goes to the server, not to them.
      throw new LatexCompileError(
        'LaTeX compilation failed',
        (err as { stderr?: string }).stderr || String(err),
        'latex',
      );
    }

    return readFile(join(dir, 'main.pdf'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
