import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { NoToolUseError } from '../../../../lib/anthropic';
import { extractAnswerFacts, generateJobQuestions } from '../../../../lib/interview/jobQuestions';
import { hasMeaningfulNumber } from '../../../../lib/interview/taxonomy';
import type { ProfileEntry, ResumeStructure } from '../../../../lib/types';
import { requireUserId } from '../../../../server/auth';
import {
  addFactsFromAnswers,
  getApplication,
  getLatestResume,
  getProfile,
  getProfileEntries,
} from '../../../../server/db/repository';
import { errorResponse, SERVICE_UNAVAILABLE } from '../../../claude/shared';

export const maxDuration = 60;

/**
 * The questions worth asking because of this job — and the answers coming back.
 *
 * GET generates them; POST records what was said. Both live here because they
 * are two halves of one exchange, and the answers only make sense against the
 * questions that prompted them.
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const userId = await requireUserId();

  const [record, profile, resume] = await Promise.all([
    getApplication(userId, params.id),
    getProfile(userId),
    getLatestResume(userId, params.id),
  ]);

  if (!record) return errorResponse({ type: 'generic', message: 'Application not found.' }, 404);

  const structure = (resume?.structure ?? profile?.resumeStructure ?? null) as ResumeStructure | null;
  if (!structure?.name) {
    return errorResponse({ type: 'generic', message: 'Build your resume first.' }, 400);
  }

  try {
    const { questions } = await generateJobQuestions({
      posting: {
        company: record.posting?.company ?? null,
        role: record.posting?.role ?? null,
        description: record.posting?.description ?? null,
      },
      resume: structure,
      missingRequirements: (resume?.missingRequirements as string[]) ?? [],
    });
    return NextResponse.json({ questions });
  } catch (error) {
    return handle(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const userId = await requireUserId();

  let body: { answers?: { question: string; answer: string }[] };
  try {
    body = await request.json();
  } catch {
    return errorResponse({ type: 'generic', message: SERVICE_UNAVAILABLE }, 400);
  }

  const answered = (body.answers ?? []).filter((a) => a.answer?.trim());
  if (answered.length === 0) return NextResponse.json({ added: 0 });

  const entries = await getProfileEntries(userId);
  const typed: ProfileEntry[] = entries.map((e) => ({
    id: e.id,
    kind: e.kind as ProfileEntry['kind'],
    title: e.title ?? undefined,
    org: e.org ?? undefined,
    orderIndex: e.orderIndex,
    source: e.source as ProfileEntry['source'],
  }));

  try {
    const { facts } = await extractAnswerFacts(answered, typed);

    // Match "about" back to a real entry by title; anything unmatched becomes a
    // fact about the person rather than being dropped.
    const byTitle = new Map(
      entries.map((e) => [(e.title ?? '').toLowerCase().trim(), e.id] as const),
    );

    const rows = facts.map((f) => ({
      entryId: byTitle.get(f.about.toLowerCase().trim()) ?? null,
      category: f.category,
      text: f.text,
      // Computed here, never taken from the model: it has an incentive to call
      // a gap closed, and this rule is what keeps metrics honest.
      hasNumber: hasMeaningfulNumber(f.text),
    }));

    await addFactsFromAnswers(userId, rows);
    return NextResponse.json({ added: rows.length });
  } catch (error) {
    return handle(error);
  }
}

function handle(error: unknown) {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return errorResponse({ type: 'auth', message: 'Your API key may be invalid or out of credits.' }, 401);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return errorResponse({ type: 'network', message: 'Your internet connection dropped.' }, 503);
  }
  if (error instanceof NoToolUseError) {
    return errorResponse({ type: 'generic', message: SERVICE_UNAVAILABLE }, 502);
  }
  console.error('[Resumi] Job questions failed:', error);
  return errorResponse({ type: 'generic', message: SERVICE_UNAVAILABLE }, 502);
}
