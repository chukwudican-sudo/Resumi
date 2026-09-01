import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { NoToolUseError, callClaude } from '../../../../lib/anthropic';
import { UNIVERSAL_RULES } from '../../../../lib/systemPrompt';
import type { ResumeStructure } from '../../../../lib/types';
import { requireUserId } from '../../../../server/auth';
import {
  getActiveRules,
  getApplication,
  getProfile,
  saveResume,
  spendCredit,
} from '../../../../server/db/repository';
import { TAILOR_TOOL, errorResponse, SERVICE_UNAVAILABLE } from '../../../claude/shared';

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

  const [record, profile, rules] = await Promise.all([
    getApplication(userId, params.id),
    getProfile(userId),
    getActiveRules(userId),
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
  const ruleText = rules.length
    ? `\n\nThe person's own rules, which apply to every resume they make:\n${rules.map((r) => `- ${r.text}`).join('\n')}`
    : '';

  const content = [
    {
      type: 'text' as const,
      text: [
        'Their profile — the Resume Structure to edit. This is the resume of record; keep the same entries, dates, and section identities, and rewrite freely within them:',
        '```json',
        JSON.stringify(structure, null, 2),
        '```',
        `Job posting — Company: ${posting?.company ?? '(not provided)'}, Role: ${posting?.role ?? '(not provided)'}\n${posting?.description ?? '(no description)'}`,
        ruleText,
        'Produce the tailored resume now via submit_tailored_resume. No About Me document was provided — the structure above is your only source for what this person has done, so tailor within it and invent nothing to fill gaps.',
      ]
        .filter(Boolean)
        .join('\n\n'),
    },
  ];

  try {
    const { toolInput } = await callClaude<TailorResult>({
      kind: 'tailor',
      system: UNIVERSAL_RULES,
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

    return NextResponse.json({ resumeId, creditsLeft: remaining });
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
    console.error('[Resumi] Tailoring failed:', error);
    return errorResponse({ type: 'generic', message: SERVICE_UNAVAILABLE }, 502);
  }
}
