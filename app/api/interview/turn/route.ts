import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { NoToolUseError } from '../../../lib/anthropic';
import { runTurn } from '../../../lib/interview/engine';
import { emptyInterviewState, type InterviewState } from '../../../lib/interview/state';
import type { Fact, InterviewQuestion, InterviewTurn, ProfileEntry } from '../../../lib/types';
import { requireUserId } from '../../../server/auth';
import {
  getActiveFacts,
  getActiveInterview,
  getInterviewTurns,
  getProfileEntries,
  getUser,
  saveInterviewTurn,
  startInterview,
} from '../../../server/db/repository';
import { errorResponse, SERVICE_UNAVAILABLE } from '../../claude/shared';

export const maxDuration = 60;

/**
 * One interview turn, against the database.
 *
 * The state is rebuilt server-side from the session's own rows rather than
 * accepted from the browser. That is the whole point of moving off
 * localStorage: what someone has told us is not something their client gets to
 * assert, and a refresh mid-interview now loses nothing.
 */
export async function POST(request: NextRequest) {
  const userId = await requireUserId();

  if (!process.env.ANTHROPIC_API_KEY) {
    return errorResponse({ type: 'auth', message: 'Your API key may be invalid or out of credits.' }, 500);
  }

  let body: { answer?: string | null; skipped?: boolean };
  try {
    body = await request.json();
  } catch {
    return errorResponse({ type: 'generic', message: SERVICE_UNAVAILABLE }, 400);
  }

  const session = (await getActiveInterview(userId)) ?? (await startInterview(userId));
  if (!session) {
    return errorResponse({ type: 'generic', message: 'Could not start the interview.' }, 500);
  }

  const [user, entries, factRows, turnRows] = await Promise.all([
    getUser(userId),
    getProfileEntries(userId),
    getActiveFacts(userId),
    getInterviewTurns(session.id),
  ]);

  const state: InterviewState = {
    ...emptyInterviewState(),
    entries: entries.map((e) => ({
      id: e.id,
      kind: e.kind as ProfileEntry['kind'],
      title: e.title ?? undefined,
      org: e.org ?? undefined,
      location: e.location ?? undefined,
      datesDisplay: e.datesDisplay ?? undefined,
      orderIndex: e.orderIndex,
      source: e.source as ProfileEntry['source'],
    })),
    facts: factRows.map((f) => ({
      id: f.id,
      entryId: f.entryId,
      category: f.category as Fact['category'],
      text: f.text,
      hasNumber: f.hasNumber,
      confidence: f.confidence,
      source: f.source as Fact['source'],
      sourceTurnId: f.sourceTurnId,
      status: 'active' as const,
    })),
    turns: turnRows.map((t) => ({
      id: t.id,
      idx: t.idx,
      question: t.question as InterviewQuestion,
      rawAnswer: t.rawAnswer ?? '',
      skipped: t.skipped,
    })) satisfies InterviewTurn[],
    phase: session.phase as InterviewState['phase'],
    phaseStartedAtTurn: session.phaseStartedAtTurn,
    pendingQuestion: (session.pendingQuestion as InterviewQuestion | null) ?? null,
  };

  try {
    const result = await runTurn(state, body.answer ?? null, Boolean(body.skipped), {
      goal: { stage: user?.stage ?? '', targetField: user?.targetField ?? '' },
      openQuestions: (session.openQuestions as string[]) ?? undefined,
    });

    // The engine returns the full list; only the turn just answered is new.
    const recordedTurn =
      result.state.turns.length > state.turns.length
        ? result.state.turns[result.state.turns.length - 1]
        : null;

    const knownEntryIds = new Set(state.entries.map((e) => e.id));
    const newEntries = result.state.entries.filter((e) => !knownEntryIds.has(e.id));

    await saveInterviewTurn(
      userId,
      session.id,
      recordedTurn
        ? {
            idx: recordedTurn.idx,
            question: recordedTurn.question,
            rawAnswer: recordedTurn.rawAnswer,
            skipped: recordedTurn.skipped,
          }
        : null,
      newEntries.map((e) => ({
        id: e.id,
        kind: e.kind,
        title: e.title,
        org: e.org,
        location: e.location,
        datesDisplay: e.datesDisplay,
        orderIndex: e.orderIndex,
      })),
      result.newFacts.map((f) => ({
        id: f.id,
        entryId: f.entryId,
        category: f.category,
        text: f.text,
        hasNumber: f.hasNumber,
        confidence: f.confidence,
        sourceTurnId: recordedTurn?.id ?? null,
      })),
      {
        phase: result.state.phase,
        phaseStartedAtTurn: result.state.phaseStartedAtTurn,
        pendingQuestion: result.state.pendingQuestion,
        finished: result.state.finished,
      },
    );

    return NextResponse.json({
      question: result.state.pendingQuestion,
      acknowledgement: result.acknowledgement,
      newFacts: result.newFacts,
      entries: result.state.entries,
      facts: result.state.facts,
      turnCount: result.state.turns.length,
      coverage: result.coverage.overall,
      phase: result.state.phase,
      finished: result.state.finished,
      finishReason: result.state.finishReason,
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return errorResponse({ type: 'auth', message: 'Your API key may be invalid or out of credits.' }, 401);
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return errorResponse({ type: 'network', message: 'Your internet connection dropped.' }, 503);
    }
    if (error instanceof NoToolUseError) {
      return errorResponse({ type: 'generic', message: SERVICE_UNAVAILABLE }, 502);
    }
    console.error('[Resumi] Interview turn failed:', error);
    return errorResponse({ type: 'generic', message: SERVICE_UNAVAILABLE }, 502);
  }
}
