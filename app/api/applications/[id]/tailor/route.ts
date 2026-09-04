import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { NoToolUseError, callClaude } from '../../../../lib/anthropic';
import { TAILOR_INVARIANT, buildUserContext } from '../../../../lib/systemPrompt';
import type { ResumeStructure } from '../../../../lib/types';
import { requireUserId } from '../../../../server/auth';
import { polishIfStale } from '../../../../server/polishProfile';
import {
  getActiveRules,
  getUser,
  getApplication,
  getProfile,
  saveResume,
  spendCredit,
} from '../../../../server/db/repository';
import { capacityResponse, TAILOR_TOOL, errorResponse, SERVICE_UNAVAILABLE } from '../../../claude/shared';

export const maxDuration = 60;

interface TailorResult {
  structure: ResumeStructure;
  log: string[];
  matchScore: number;
  missingRequirements: string[];
  vague: boolean;
  vagueReason: string;
  estimatedPages: number;
  structuralChanges: { description: string; reason: string }[];
  warnings: string[];
}

/** Rewrites the profile around one job posting and keeps the result. */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const userId = await requireUserId();

  if (!process.env.ANTHROPIC_API_KEY) {
    return errorResponse({ type: 'auth', message: 'Your API key may be invalid or out of credits.' }, 500);
  }

  // Tailoring reads the master resume, so it should read the good version of
  // it. Feeding the model "Uses Python for backend algorithm work" as a skill
  // wastes the call it is about to make.
  const polished = await polishIfStale(userId);

  const [record, profile, rules, user] = await Promise.all([
    getApplication(userId, params.id),
    getProfile(userId),
    getActiveRules(userId),
    getUser(userId),
  ]);

  if (!record) return errorResponse({ type: 'generic', message: 'Application not found.' }, 404);

  const structure = (profile?.resumeStructure ?? null) as ResumeStructure | null;
  if (!structure?.name) {
    return errorResponse({ type: 'generic', message: 'Build your profile first.' }, 400);
  }

  // Spend before generating. The other order lets two tabs both produce a
  // resume on the last remaining credit.
  const remaining = await spendCredit(userId);
  if (remaining === null) {
    return errorResponse(
      { type: 'generic', message: "You've used your free applications for this month." },
      402,
    );
  }

  const posting = record.posting;

  const content = [
    {
      type: 'text' as const,
      text: [
        'Their profile — the Resume Structure to edit. This is the resume of record; keep the same entries, dates, and section identities, and rewrite freely within them:',
        '```json',
        JSON.stringify(structure, null, 2),
        '```',
        `Job posting — Company: ${posting?.company ?? '(not provided)'}, Role: ${posting?.role ?? '(not provided)'}\n${posting?.description ?? '(no description)'}`,
        'Produce the tailored resume now via submit_tailored_resume. No About Me document was provided — the structure above is your only source for what this person has done, so tailor within it and invent nothing to fill gaps.',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];

  try {
    const { toolInput } = await callClaude<TailorResult>({
      userId,
      kind: 'tailor',
      system: TAILOR_INVARIANT,
      systemSuffix: buildUserContext({
        displayName: structure.name || user?.displayName,
        locale: user?.locale,
        rules,
      }),
      content,
      tool: TAILOR_TOOL,
    });

    const resumeId = await saveResume(userId, params.id, {
      structure: toolInput.structure,
      matchScore: toolInput.matchScore ?? null,
      missingRequirements: toolInput.missingRequirements ?? [],
      log: toolInput.log ?? [],
      warnings: toolInput.warnings ?? [],
      estimatedPages: toolInput.estimatedPages ?? null,
    });

    // Said out loud rather than done quietly: polishing regroups skills and
    // can reorder sections, and finding that out from a resume you already
    // sent is worse than being told now.
    return NextResponse.json({
      resumeId,
      creditsLeft: remaining,
      polished: polished ? { corrections: polished.corrections, warnings: polished.warnings } : null,
    });
  } catch (error) {
    const refused = capacityResponse(error);
    if (refused) return refused;
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return errorResponse({ type: 'auth', message: 'Your API key may be invalid or out of credits.' }, 401);
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return errorResponse({ type: 'network', message: 'Your internet connection dropped.' }, 503);
    }
    if (error instanceof NoToolUseError) {
      return errorResponse({ type: 'generic', message: SERVICE_UNAVAILABLE }, 502);
    }
    console.error('[Resumi] Tailoring failed:', error);
    return errorResponse({ type: 'generic', message: SERVICE_UNAVAILABLE }, 502);
  }
}
