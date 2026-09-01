import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { NoToolUseError } from '../../../lib/anthropic';
import { runTurn, type InterviewState } from '../../../lib/interview/engine';
import { errorResponse, SERVICE_UNAVAILABLE } from '../../claude/shared';

export const maxDuration = 60;

/**
 * Runs one interview turn.
 *
 * Stateless: the client holds the interview state and sends it up each turn.
 * That is what lets the interview work before there is a database, and it keeps
 * this route a pure function of its input. When sessions move to Postgres this
 * becomes a read of the session row plus a write of the new turn, and the
 * engine underneath does not change.
 *
 * The state arriving from the client is untrusted. Today it is the user's own
 * browser and the only thing at stake is their own interview, but once this is
 * multi-tenant the state must be loaded server-side by session id instead.
 */
export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return errorResponse(
      { type: 'auth', message: 'Your API key may be invalid or out of credits. Check console.anthropic.com.' },
      500,
    );
  }

  let body: {
    state?: InterviewState;
    answer?: string | null;
    skipped?: boolean;
    goal?: { stage: string; targetField: string };
    openQuestions?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse({ type: 'generic', message: SERVICE_UNAVAILABLE }, 400);
  }

  const state = body.state;
  if (!state || !Array.isArray(state.turns) || !Array.isArray(state.facts) || !Array.isArray(state.entries)) {
    return errorResponse({ type: 'generic', message: 'Interview state is missing or malformed.' }, 400);
  }

  try {
    const result = await runTurn(state, body.answer ?? null, Boolean(body.skipped), {
      goal: body.goal,
      openQuestions: Array.isArray(body.openQuestions) ? body.openQuestions : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return errorResponse({ type: 'auth', message: 'Your API key may be invalid or out of credits. Check console.anthropic.com.' }, 401);
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return errorResponse({ type: 'network', message: 'Your internet connection dropped. Please check your connection.' }, 503);
    }
    if (error instanceof NoToolUseError) {
      return errorResponse({ type: 'generic', message: SERVICE_UNAVAILABLE }, 502);
    }
    return errorResponse({ type: 'generic', message: SERVICE_UNAVAILABLE }, 502);
  }
}
