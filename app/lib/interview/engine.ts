import Anthropic from '@anthropic-ai/sdk';
import { callClaude } from '../anthropic';
import type {
  Fact,
  FactCategory,
  InterviewPhase,
  InterviewQuestion,
  InterviewTurn,
  ProfileEntry,
  TokenUsage,
} from '../types';
import { computeCoverage, isCoverageSufficient, type CoverageReport } from './coverage';
import { INTERVIEW_PROMPT, buildTurnMessage } from './prompt';
import { findDuplicate, type AskedQuestion } from './similarity';
import { MAX_TURNS, MIN_TURNS_BEFORE_DONE, PHASE_TURN_CAPS, nextPhase, type InterviewState } from './state';
import { hasMeaningfulNumber } from './taxonomy';

// Re-exported so server-side callers can pull everything from one module.
export { MAX_TURNS, MIN_TURNS_BEFORE_DONE, emptyInterviewState, type InterviewState } from './state';

const FACT_CATEGORIES: FactCategory[] = [
  'action', 'metric', 'scope', 'tooling', 'outcome',
  'context', 'skill', 'credential', 'preference', 'identity',
];

export const INTERVIEW_TURN_TOOL: Anthropic.Tool = {
  name: 'submit_interview_turn',
  description:
    'Record the facts learned from the most recent answer and ask the next question. Called exactly once per turn.',
  input_schema: {
    type: 'object',
    properties: {
      facts: {
        type: 'array',
        description:
          'Atomic facts learned from the latest answer. Empty array if the answer contained nothing substantive. Never invent facts to fill a gap.',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string', description: "One piece of information, in the person's own terms." },
            category: { type: 'string', enum: FACT_CATEGORIES },
            entryId: {
              type: 'string',
              description:
                'The id of the entry this fact belongs to, or the tempId of one being created in this same call. Omit for facts about the person rather than one role or project.',
            },
            confidence: {
              type: 'number',
              description: '0..1 — how directly the person stated this. Lower it when you are inferring.',
            },
          },
          required: ['text', 'category', 'confidence'],
          additionalProperties: false,
        },
      },
      newEntries: {
        type: 'array',
        description: 'Jobs, projects, or degrees mentioned that are not yet recorded.',
        items: {
          type: 'object',
          properties: {
            tempId: { type: 'string', description: 'A short id used to attach facts in this same call.' },
            kind: { type: 'string', enum: ['experience', 'project', 'education'] },
            title: { type: 'string' },
            org: { type: 'string' },
            location: { type: 'string' },
            datesDisplay: { type: 'string', description: 'Dates exactly as the person said them.' },
          },
          required: ['tempId', 'kind'],
          additionalProperties: false,
        },
      },
      entryUpdates: {
        type: 'array',
        description: 'Corrections to entries already recorded.',
        items: {
          type: 'object',
          properties: {
            entryId: { type: 'string' },
            field: { type: 'string', enum: ['title', 'org', 'location', 'datesDisplay'] },
            value: { type: 'string' },
          },
          required: ['entryId', 'field', 'value'],
          additionalProperties: false,
        },
      },
      acknowledgement: {
        type: 'string',
        description:
          'One short sentence reacting specifically to what they just said. Empty string on the first turn. No generic filler.',
      },
      nextQuestion: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The question. One question only.' },
          why: { type: 'string', description: 'One short sentence on why this is worth asking, shown to the user.' },
          targets: {
            type: 'object',
            properties: {
              entryId: { type: 'string', description: 'Entry the question is about. Omit if about the person.' },
              category: { type: 'string', enum: FACT_CATEGORIES },
            },
            required: ['category'],
            additionalProperties: false,
          },
          kind: { type: 'string', enum: ['open', 'numeric', 'choice'] },
          choices: { type: 'array', items: { type: 'string' } },
          skippable: { type: 'boolean' },
        },
        required: ['text', 'why', 'targets', 'kind', 'skippable'],
        additionalProperties: false,
      },
      phaseAdvance: { type: 'boolean', description: 'True when the current phase has what it needs.' },
      done: { type: 'boolean', description: 'True when further questions would add little.' },
      doneReason: { type: 'string' },
    },
    required: ['facts', 'newEntries', 'entryUpdates', 'acknowledgement', 'nextQuestion', 'phaseAdvance', 'done', 'doneReason'],
    additionalProperties: false,
  },
};

interface RawTurnOutput {
  facts: { text: string; category: FactCategory; entryId?: string; confidence: number }[];
  newEntries: { tempId: string; kind: ProfileEntry['kind']; title?: string; org?: string; location?: string; datesDisplay?: string }[];
  entryUpdates: { entryId: string; field: 'title' | 'org' | 'location' | 'datesDisplay'; value: string }[];
  acknowledgement: string;
  nextQuestion: {
    text: string; why: string;
    targets: { entryId?: string; category: FactCategory };
    kind: 'open' | 'numeric' | 'choice'; choices?: string[]; skippable: boolean;
  };
  phaseAdvance: boolean;
  done: boolean;
  doneReason: string;
}

export interface RunTurnResult {
  state: InterviewState;
  coverage: CoverageReport;
  acknowledgement: string;
  newFacts: Fact[];
  usage: TokenUsage;
}

function toAsked(q: { text: string; targets: { entryId?: string; category: FactCategory } }): AskedQuestion {
  return { text: q.text, entryId: q.targets.entryId ?? null, category: q.targets.category };
}

function askedQuestions(turns: InterviewTurn[]): AskedQuestion[] {
  return turns.map((t) => ({
    text: t.question.text,
    entryId: t.question.targets.entryId,
    category: t.question.targets.category,
  }));
}

let idCounter = 0;
function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}`;
}

/**
 * Runs one interview turn: records the answer, extracts facts, and produces the
 * next question.
 *
 * `answer` is null on the opening turn, when there is nothing to react to yet.
 */
export async function runTurn(state: InterviewState, answer: string | null, skipped = false): Promise<RunTurnResult> {
  const coverageBefore = computeCoverage(state.entries, state.facts);

  const message = buildTurnMessage({
    entries: state.entries,
    facts: state.facts,
    coverage: coverageBefore,
    turns: state.turns,
    phase: state.phase,
    latestAnswer: answer,
    turnCount: state.turns.length,
    maxTurns: MAX_TURNS,
  });

  let { toolInput, usage } = await callClaude<RawTurnOutput>({
    kind: 'interview_turn',
    system: INTERVIEW_PROMPT,
    content: [{ type: 'text', text: message }],
    tool: INTERVIEW_TURN_TOOL,
  });

  // The prompt forbids repeating a question, but on an answer that never
  // addressed the question the model reliably rewords and re-asks. One retry
  // with the offending question quoted back costs a few seconds on a rare turn
  // and is far cheaper than the user reading the same question four times.
  const asked = askedQuestions(state.turns);
  const duplicate = findDuplicate(toAsked(toolInput.nextQuestion), asked);
  if (duplicate) {
    const retry = await callClaude<RawTurnOutput>({
      kind: 'interview_turn',
      system: INTERVIEW_PROMPT,
      content: [
        {
          type: 'text',
          text: [
            message,
            '',
            '[REJECTED]',
            `You just proposed: "${toolInput.nextQuestion.text}"`,
            `That repeats a question already asked: "${duplicate.text}"`,
            'They did not answer it, and asking again in different words will not help. Keep the facts you extracted, then ask about a different gap entirely — pick one from the coverage list that concerns another entry or another category.',
          ].join('\n'),
        },
      ],
      tool: INTERVIEW_TURN_TOOL,
    });

    // Keep the retry's question but the original extraction, so a second pass
    // cannot drop or duplicate facts already pulled from the answer.
    toolInput = { ...retry.toolInput, facts: toolInput.facts, newEntries: toolInput.newEntries };
    usage = {
      inputTokens: usage.inputTokens + retry.usage.inputTokens,
      outputTokens: usage.outputTokens + retry.usage.outputTokens,
      cacheReadTokens: (usage.cacheReadTokens ?? 0) + (retry.usage.cacheReadTokens ?? 0),
      cacheWriteTokens: (usage.cacheWriteTokens ?? 0) + (retry.usage.cacheWriteTokens ?? 0),
      costUsd: usage.costUsd + retry.usage.costUsd,
    };
  }

  // Record the turn that was just answered, before applying what it produced.
  const turns = [...state.turns];
  if (state.pendingQuestion) {
    turns.push({
      id: makeId('turn'),
      idx: turns.length,
      question: state.pendingQuestion,
      rawAnswer: answer ?? '',
      skipped,
    });
  }

  // Create any new entries, mapping tempId -> real id so facts can attach.
  const entries = [...state.entries];
  const tempIdMap = new Map<string, string>();
  for (const raw of toolInput.newEntries ?? []) {
    const id = makeId('entry');
    tempIdMap.set(raw.tempId, id);
    entries.push({
      id,
      kind: raw.kind,
      title: raw.title,
      org: raw.org,
      location: raw.location,
      datesDisplay: raw.datesDisplay,
      // Newest mentioned sits at the front; the user reorders later in the UI.
      orderIndex: entries.filter((e) => e.kind === raw.kind).length,
      source: 'interview',
    });
  }

  for (const update of toolInput.entryUpdates ?? []) {
    const target = entries.find((e) => e.id === update.entryId);
    if (target) (target as any)[update.field] = update.value;
  }

  const turnId = turns.length ? turns[turns.length - 1].id : null;
  const newFacts: Fact[] = (toolInput.facts ?? []).map((raw) => {
    const resolvedEntryId = raw.entryId ? tempIdMap.get(raw.entryId) ?? raw.entryId : null;
    return {
      id: makeId('fact'),
      entryId: entries.some((e) => e.id === resolvedEntryId) ? resolvedEntryId : null,
      category: raw.category,
      text: raw.text,
      // Computed here, never taken from the model — the model has an incentive
      // to mark a gap closed, and this rule is what keeps metrics honest.
      hasNumber: hasMeaningfulNumber(raw.text),
      confidence: raw.confidence ?? 1,
      source: 'interview',
      sourceTurnId: turnId,
      status: 'active',
    };
  });

  const facts = [...state.facts, ...newFacts];
  const coverage = computeCoverage(entries, facts);

  const question: InterviewQuestion = {
    text: toolInput.nextQuestion.text,
    why: toolInput.nextQuestion.why,
    targets: {
      entryId: toolInput.nextQuestion.targets.entryId
        ? tempIdMap.get(toolInput.nextQuestion.targets.entryId) ?? toolInput.nextQuestion.targets.entryId
        : null,
      category: toolInput.nextQuestion.targets.category,
    },
    kind: toolInput.nextQuestion.kind,
    choices: toolInput.nextQuestion.choices,
    skippable: toolInput.nextQuestion.skippable,
  };

  // Termination is the app's call. The model's `done` is advice, floored so it
  // cannot bail out early and ceilinged so it cannot run forever.
  let finished = false;
  let finishReason = '';
  if (turns.length >= MAX_TURNS) {
    finished = true;
    finishReason = 'Reached the maximum number of questions.';
  } else if (isCoverageSufficient(coverage) && turns.length >= MIN_TURNS_BEFORE_DONE) {
    finished = true;
    finishReason = 'Collected enough to build a strong resume.';
  } else if (toolInput.done && turns.length >= MIN_TURNS_BEFORE_DONE) {
    finished = true;
    finishReason = toolInput.doneReason || 'Nothing substantial left to ask.';
  }

  // Advance when the model says so, or when the phase has used its budget.
  const turnsInPhase = turns.length - state.phaseStartedAtTurn;
  const shouldAdvance = toolInput.phaseAdvance || turnsInPhase >= PHASE_TURN_CAPS[state.phase];
  const phase = shouldAdvance ? nextPhase(state.phase) : state.phase;

  return {
    state: {
      entries,
      facts,
      turns,
      phase,
      phaseStartedAtTurn: phase === state.phase ? state.phaseStartedAtTurn : turns.length,
      pendingQuestion: finished ? null : question,
      finished,
      finishReason,
    },
    coverage,
    acknowledgement: toolInput.acknowledgement ?? '',
    newFacts,
    usage,
  };
}
