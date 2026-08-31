import type { Fact, InterviewPhase, InterviewQuestion, InterviewTurn, ProfileEntry } from '../types';

/**
 * Interview state and its constants, kept free of any server-only import.
 *
 * The engine that runs a turn pulls in the Anthropic SDK, which reaches for
 * node:path and cannot be bundled for the browser. Client components need the
 * shape of the state and the turn limits but never the engine itself, so those
 * live here and `engine.ts` builds on top.
 */

export const MIN_TURNS_BEFORE_DONE = 6;
export const MAX_TURNS = 25;

/**
 * Most turns a phase may consume before it advances regardless of what the
 * model says. Without this the interview can sit in one phase circling the same
 * ground, which is precisely how it starts to feel like a form.
 */
export const PHASE_TURN_CAPS: Record<InterviewPhase, number> = {
  identity: 3,
  breadth: 4,
  depth: 14,
  skills: 4,
};

export const PHASE_ORDER: InterviewPhase[] = ['identity', 'breadth', 'depth', 'skills'];

export function nextPhase(phase: InterviewPhase): InterviewPhase {
  const i = PHASE_ORDER.indexOf(phase);
  return i < PHASE_ORDER.length - 1 ? PHASE_ORDER[i + 1] : phase;
}

export interface InterviewState {
  entries: ProfileEntry[];
  facts: Fact[];
  turns: InterviewTurn[];
  phase: InterviewPhase;
  /** Turn index the current phase began at, used to enforce PHASE_TURN_CAPS. */
  phaseStartedAtTurn: number;
  pendingQuestion: InterviewQuestion | null;
  finished: boolean;
  finishReason: string;
}

export function emptyInterviewState(): InterviewState {
  return {
    entries: [],
    facts: [],
    turns: [],
    phase: 'identity',
    phaseStartedAtTurn: 0,
    pendingQuestion: null,
    finished: false,
    finishReason: '',
  };
}
