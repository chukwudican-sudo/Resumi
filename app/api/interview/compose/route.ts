import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { NoToolUseError } from '../../../lib/anthropic';
import { cleanWarning, composeProfile, findUncitedBullets } from '../../../lib/interview/compose';
import type { Fact, ProfileEntry } from '../../../lib/types';
import { errorResponse, SERVICE_UNAVAILABLE } from '../../claude/shared';

export const maxDuration = 60;

/** Turns the interview's collected facts into a ResumeStructure. */
export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return errorResponse(
      { type: 'auth', message: 'Your API key may be invalid or out of credits. Check console.anthropic.com.' },
      500,
    );
  }

  let body: { entries?: ProfileEntry[]; facts?: Fact[] };
  try {
    body = await request.json();
  } catch {
    return errorResponse({ type: 'generic', message: SERVICE_UNAVAILABLE }, 400);
  }

  const entries = body.entries;
  const facts = body.facts;
  if (!Array.isArray(entries) || !Array.isArray(facts)) {
    return errorResponse({ type: 'generic', message: 'Interview data is missing or malformed.' }, 400);
  }
  if (facts.length === 0) {
    return errorResponse({ type: 'generic', message: 'There is nothing to build a profile from yet.' }, 400);
  }

  try {
    const result = await composeProfile(entries, facts);

    // A bullet the model could not trace to a fact is one it invented. Surface
    // it as a warning rather than letting it pass silently into the resume.
    const uncited = findUncitedBullets(result, facts);
    const warnings = result.warnings.map(cleanWarning).filter(Boolean);
    if (uncited.length) {
      warnings.push(
        `${uncited.length} bullet${uncited.length === 1 ? '' : 's'} could not be traced back to anything you said. Check ${uncited.length === 1 ? 'it' : 'them'} before using this resume: ${uncited.map((b) => `"${b}"`).join('; ')}`,
      );
    }

    return NextResponse.json({
      structure: result.structure,
      bulletSources: result.bulletSources,
      warnings,
      usage: result.usage,
    });
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
