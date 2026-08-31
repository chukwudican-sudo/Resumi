/**
 * Terminal harness for the interview engine.
 *
 * The point is to judge question quality before any UI exists. If the questions
 * do not feel sharp here, they will not feel sharp in a chat bubble, and the
 * component work would be premature.
 *
 *   npx tsx scripts/interview.ts
 *
 * Commands during the interview:
 *   :skip    skip the current question
 *   :state   dump coverage and recorded facts
 *   :quit    end and print the transcript
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { computeCoverage } from '../app/lib/interview/coverage';
import { MAX_TURNS, emptyInterviewState, runTurn, type InterviewState } from '../app/lib/interview/engine';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function bar(fraction: number, width = 24): string {
  const filled = Math.round(fraction * width);
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}

function dumpState(state: InterviewState) {
  const coverage = computeCoverage(state.entries, state.facts);
  console.log(`\n${BOLD}── State ──${RESET}`);
  console.log(`Coverage ${bar(coverage.overall)} ${Math.round(coverage.overall * 100)}%   phase: ${state.phase}   turns: ${state.turns.length}`);

  if (state.entries.length) {
    console.log(`\n${BOLD}Entries${RESET}`);
    for (const e of state.entries) {
      const label = [e.title, e.org].filter(Boolean).join(' at ') || `(untitled ${e.kind})`;
      console.log(`  ${e.kind.padEnd(10)} ${label}${e.datesDisplay ? ` ${DIM}(${e.datesDisplay})${RESET}` : ''}`);
      for (const f of state.facts.filter((x) => x.entryId === e.id)) {
        const flag = f.category === 'metric' && !f.hasNumber ? ` ${YELLOW}(no number)${RESET}` : '';
        console.log(`    ${DIM}[${f.category}]${RESET} ${f.text}${flag}`);
      }
    }
  }

  const globals = state.facts.filter((f) => !f.entryId);
  if (globals.length) {
    console.log(`\n${BOLD}About the person${RESET}`);
    for (const f of globals) console.log(`  ${DIM}[${f.category}]${RESET} ${f.text}`);
  }

  if (coverage.gaps.length) {
    console.log(`\n${BOLD}Top gaps${RESET}`);
    for (const g of coverage.gaps.slice(0, 5)) {
      console.log(`  ${DIM}${g.priority.toFixed(1).padStart(5)}${RESET}  [${g.category}] ${g.hint}`);
    }
  }
  console.log('');
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set. Try: export $(grep -v "^#" .env.local | xargs)');
    process.exit(1);
  }

  const rl = createInterface({ input: stdin, output: stdout });
  let state = emptyInterviewState();
  let answer: string | null = null;
  let skipped = false;
  let totalCost = 0;
  let totalCacheRead = 0;

  console.log(`${BOLD}Resumi interview harness${RESET}`);
  console.log(`${DIM}:skip to skip · :state to inspect · :quit to stop${RESET}\n`);

  while (!state.finished) {
    const started = Date.now();
    let result;
    try {
      result = await runTurn(state, answer, skipped);
    } catch (err) {
      console.error(`\n${YELLOW}Turn failed:${RESET}`, err instanceof Error ? err.message : err);
      break;
    }
    const elapsed = Date.now() - started;

    state = result.state;
    totalCost += result.usage.costUsd;
    totalCacheRead += result.usage.cacheReadTokens ?? 0;
    skipped = false;

    if (result.acknowledgement) console.log(`${DIM}${result.acknowledgement}${RESET}`);

    if (result.newFacts.length) {
      const summary = result.newFacts
        .map((f) => `${f.category}${f.category === 'metric' && !f.hasNumber ? '(no number)' : ''}`)
        .join(', ');
      console.log(`${GREEN}+${result.newFacts.length} fact${result.newFacts.length === 1 ? '' : 's'}${RESET} ${DIM}${summary}${RESET}`);
    }

    if (state.finished) break;

    const q = state.pendingQuestion!;
    const n = state.turns.length + 1;
    console.log(
      `\n${DIM}Q${n}/${MAX_TURNS} · ${state.phase} · coverage ${Math.round(result.coverage.overall * 100)}% · ${(elapsed / 1000).toFixed(1)}s${RESET}`,
    );
    console.log(`${CYAN}${BOLD}${q.text}${RESET}`);
    console.log(`${DIM}why: ${q.why}${RESET}`);

    let input = (await rl.question('> ')).trim();
    while (input === ':state') {
      dumpState(state);
      input = (await rl.question('> ')).trim();
    }

    if (input === ':quit') break;
    if (input === ':skip') {
      skipped = true;
      answer = '';
    } else {
      answer = input;
    }
  }

  rl.close();

  console.log(`\n${BOLD}── Interview over ──${RESET}`);
  if (state.finishReason) console.log(state.finishReason);
  dumpState(state);

  console.log(`${BOLD}Transcript${RESET}`);
  for (const t of state.turns) {
    console.log(`\n${DIM}Q${t.idx + 1}:${RESET} ${t.question.text}`);
    console.log(`${DIM}A${t.idx + 1}:${RESET} ${t.skipped ? '(skipped)' : t.rawAnswer}`);
  }

  const turns = state.turns.length || 1;
  console.log(
    `\n${BOLD}Cost${RESET} $${totalCost.toFixed(4)} over ${state.turns.length} turns ` +
      `(${DIM}$${(totalCost / turns).toFixed(4)}/turn, ${totalCacheRead} cached input tokens${RESET})`,
  );
  console.log(`${BOLD}Facts${RESET} ${state.facts.length} (${(state.facts.length / turns).toFixed(1)}/turn)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
