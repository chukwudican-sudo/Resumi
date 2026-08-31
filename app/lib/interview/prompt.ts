import type { Fact, InterviewPhase, InterviewTurn, ProfileEntry } from '../types';
import type { CoverageReport } from './coverage';
import { FACT_CATEGORY_DESCRIPTIONS } from './taxonomy';

/**
 * The interview's system prompt.
 *
 * Kept invariant across turns and across users so it can sit above the prompt
 * cache breakpoint. Anything that changes per turn (the profile, the coverage
 * report, the transcript) belongs in the user message built below, never here.
 */
export const INTERVIEW_PROMPT = `You are conducting a short interview to build someone's professional profile, which will later be turned into a resume. You are not writing the resume. Your only job in this conversation is to ask good questions and record what you learn.

Think of yourself as a sharp interviewer who has read the person's file and wants the specific detail that makes a story land — not a form, and not a career coach. You ask one question at a time and you listen to the answer.

WHAT YOU ARE COLLECTING
You record atomic facts. A fact is one piece of information in the person's own terms — not a polished resume bullet. Bullets get composed later from these facts, so raw and specific beats smooth and vague every time.

Fact categories:
${Object.entries(FACT_CATEGORY_DESCRIPTIONS)
  .map(([key, description]) => `- ${key}: ${description}`)
  .join('\n')}

HOW TO ASK
1. Ask exactly one question per turn. Never stack two questions together, and never append "and what was the impact?" to another question.
2. Ask about something concrete and answerable in a sentence or two. "How many people were on that team?" is answerable. "Tell me about your experience" is not.
3. Follow the thread. If their last answer opened something more interesting than the gap you were told to target, follow it — but say so in your reasoning.
4. Never ask about something you already know. Everything already recorded is shown to you; re-asking is the fastest way to lose someone's trust.
5. Never re-ask a question you have already asked. You are shown every question asked so far under ALREADY ASKED — treat rewording one of them as asking it again. If a question went unanswered and still matters, come back to it much later and in a visibly different form, at most once.
6. People often answer a different question than the one you asked, or drift onto something else. That is normal and it is not a failure. Record whatever they did tell you, then move to the highest-priority open gap. Do not repeat yourself trying to drag them back — if the thing you asked about still matters, it will come round again.
7. When you need a number, ask for it directly and plainly: "Roughly how many users did that serve?" Accept an estimate. Never demand precision the person plainly does not have.
8. If they say they do not know or do not remember, accept it, record nothing for that gap, and move on to something else. Do not press twice.
9. Match their register. Short answers get short questions.
10. Never ask generic interview questions — no greatest weakness, no where do you see yourself. This is not a job interview; it is a fact-finding conversation.

EXTRACTING FACTS
- Extract only what the person actually said or plainly implied. Never invent a number, a tool, or an outcome to fill a gap. An empty facts array is a correct answer when they said nothing substantive.
- Split a rambling answer into several small facts rather than one long one.
- Set hasNumber true only when the fact text contains a real quantity. A year on its own ("started in 2019") is not a quantity. "Improved performance" is not a quantity. "Cut load time by 40%" is.
- If they mention a job, project, or degree you have not recorded yet, add it via newEntries and attach the related facts to it using its tempId.
- If they correct something you already recorded — a wrong title, a wrong date — use entryUpdates.

ACKNOWLEDGEMENT
Before each new question, write one short sentence reacting to what they just said. Make it specific to their answer. Never use empty filler like "Great!" or "Thanks for sharing." On the very first turn there is nothing to acknowledge, so return an empty string.

PHASES
- identity: who they are, how to reach them, where they studied. Two or three questions, then move on.
- breadth: enumerate the roles and projects worth including. Get the list before going deep on any one.
- depth: the bulk of the interview. Work the ranked gaps, prioritising numbers and scope on recent entries.
- skills: tools and capabilities not tied to one entry, plus any preferences about how they want the resume written.
Set phaseAdvance true when the current phase has what it needs.

FINISHING
Set done true only when further questions would add little — the recent entries have real numbers and the profile would produce a solid resume. The application decides when the interview actually ends; your signal is advice, not the decision. If the person says they want to stop, set done true immediately and do not argue.`;

/** Renders the recorded profile so the model can see what it already knows. */
function renderProfile(entries: ProfileEntry[], facts: Fact[]): string {
  if (entries.length === 0 && facts.length === 0) {
    return 'Nothing recorded yet — this is the very start of the interview.';
  }

  const active = facts.filter((f) => f.status === 'active');
  const lines: string[] = [];

  const globals = active.filter((f) => !f.entryId);
  if (globals.length) {
    lines.push('About the person:');
    for (const f of globals) lines.push(`  - [${f.category}] ${f.text}`);
  }

  const sorted = [...entries].sort((a, b) => a.orderIndex - b.orderIndex);
  for (const entry of sorted) {
    const header = [entry.title, entry.org].filter(Boolean).join(' at ') || `(untitled ${entry.kind})`;
    lines.push(`\n${entry.kind.toUpperCase()} [id: ${entry.id}] ${header}${entry.datesDisplay ? ` (${entry.datesDisplay})` : ''}`);
    const own = active.filter((f) => f.entryId === entry.id);
    if (own.length === 0) {
      lines.push('  - (nothing recorded yet)');
      continue;
    }
    for (const f of own) {
      lines.push(`  - [${f.category}${f.category === 'metric' && !f.hasNumber ? ', NO NUMBER' : ''}] ${f.text}`);
    }
  }

  return lines.join('\n');
}

/** Renders the ranked gaps. This is what steers the next question. */
function renderCoverage(report: CoverageReport, topN = 5): string {
  const lines = [`Overall coverage: ${Math.round(report.overall * 100)}%`];

  if (report.perEntry.length) {
    lines.push('\nPer entry:');
    for (const e of report.perEntry) {
      lines.push(`  ${e.label} — ${Math.round(e.score * 100)}%${e.missing.length ? ` (missing: ${e.missing.join(', ')})` : ''}`);
    }
  }

  if (report.gaps.length) {
    lines.push(`\nTop gaps, highest priority first — target one of the first three:`);
    report.gaps.slice(0, topN).forEach((g, i) => {
      lines.push(`  ${i + 1}. [${g.category}]${g.entryId ? ` entry ${g.entryId}` : ' (about the person)'} — ${g.hint}`);
    });
  } else {
    lines.push('\nNo gaps remaining.');
  }

  return lines.join('\n');
}

/**
 * Renders the conversation so far.
 *
 * Recent turns go in verbatim; older ones are compressed to a single line each,
 * because their substance is already represented losslessly by the facts in the
 * profile snapshot. This keeps the message bounded on a long interview.
 */
function renderTranscript(turns: InterviewTurn[], verbatimCount = 8): string {
  if (turns.length === 0) return 'No questions asked yet.';

  const older = turns.slice(0, Math.max(0, turns.length - verbatimCount));
  const recent = turns.slice(-verbatimCount);
  const lines: string[] = [];

  if (older.length) {
    lines.push('Earlier in the conversation (summarised):');
    for (const t of older) {
      lines.push(`  Q${t.idx + 1}: ${t.question.text} → ${t.skipped ? '(skipped)' : summarise(t.rawAnswer)}`);
    }
    lines.push('');
  }

  lines.push('Recent turns:');
  for (const t of recent) {
    lines.push(`  Q${t.idx + 1}: ${t.question.text}`);
    lines.push(`  A${t.idx + 1}: ${t.skipped ? '(skipped)' : t.rawAnswer}`);
  }

  return lines.join('\n');
}

/**
 * Every question asked so far, listed plainly.
 *
 * The transcript already contains these, but buried next to the answers, where
 * a near-duplicate is easy to miss. Repeating them as a bare list — including
 * ones that went unanswered, which are the most likely to be asked again — is
 * what makes the no-repeats rule checkable rather than aspirational.
 */
function renderAskedQuestions(turns: InterviewTurn[]): string {
  if (turns.length === 0) return 'Nothing asked yet.';
  return turns
    .map((t) => `  - "${t.question.text}"${t.skipped || !t.rawAnswer.trim() ? ' (went unanswered — do NOT simply ask it again)' : ''}`)
    .join('\n');
}

function summarise(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

const PHASE_OBJECTIVES: Record<InterviewPhase, string> = {
  identity: 'Establish who they are and how to reach them, plus their education. Keep it to two or three questions.',
  breadth: 'Find out which roles and projects belong on the resume. Get the list before going deep on any single one.',
  depth: 'Work the ranked gaps. Prioritise real numbers and scope on the most recent entries.',
  skills: 'Capture tools and capabilities not tied to one entry, and any preferences about how the resume should read.',
};

export interface TurnContext {
  entries: ProfileEntry[];
  facts: Fact[];
  coverage: CoverageReport;
  turns: InterviewTurn[];
  phase: InterviewPhase;
  /** The answer just given, or null on the opening turn. */
  latestAnswer: string | null;
  turnCount: number;
  maxTurns: number;
  /** What they told onboarding they're looking for, if anything. */
  goal?: { stage: string; targetField: string };
}

/** Builds the single user message for one interview turn. */
export function buildTurnMessage(ctx: TurnContext): string {
  const sections: string[] = [];

  // Goes first so it colours every question. Knowing someone is after a backend
  // internship rather than a senior design role changes which details are worth
  // digging for, right from the opening question.
  if (ctx.goal?.stage || ctx.goal?.targetField) {
    sections.push(
      '[WHAT THEY ARE LOOKING FOR]',
      [ctx.goal.stage, ctx.goal.targetField].filter(Boolean).join(' — '),
      'Weight your questions towards what matters for this kind of role. Do not mention this back to them as though it were news.',
      '',
    );
  }

  sections.push(
    '[PROFILE SO FAR]',
    renderProfile(ctx.entries, ctx.facts),
    '',
    '[COVERAGE]',
    renderCoverage(ctx.coverage),
    '',
    '[TRANSCRIPT]',
    renderTranscript(ctx.turns),
    '',
    '[ALREADY ASKED]',
    renderAskedQuestions(ctx.turns),
    '',
    '[PHASE]',
    `Current phase: ${ctx.phase} — ${PHASE_OBJECTIVES[ctx.phase]}`,
    `Turn ${ctx.turnCount + 1} of at most ${ctx.maxTurns}.`,
    '',
  );

  if (ctx.latestAnswer === null) {
    sections.push(
      '[YOUR TASK]',
      'This is the first turn. There is no answer to react to, so return an empty acknowledgement and an empty facts array. Ask an opening question that gets them talking about their most recent work.',
    );
  } else {
    sections.push(
      '[LATEST ANSWER]',
      ctx.latestAnswer.trim() || '(they gave an empty answer)',
      '',
      '[YOUR TASK]',
      'Extract any facts from that answer, then ask the next question. Submit both in one call to submit_interview_turn.',
    );
  }

  return sections.join('\n');
}
