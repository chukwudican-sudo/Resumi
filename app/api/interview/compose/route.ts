import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { NoToolUseError } from '../../../lib/anthropic';
import { cleanWarning, composeProfile, findUncitedBullets } from '../../../lib/interview/compose';
import { profileStrength } from '../../../lib/profileStrength';
import type { Fact, ProfileEntry } from '../../../lib/types';
import { requireUserId } from '../../../server/auth';
import {
  getActiveFacts,
  getProfileEntries,
  saveComposedProfile,
} from '../../../server/db/repository';
import { errorResponse, SERVICE_UNAVAILABLE } from '../../claude/shared';

export const maxDuration = 60;

/** Turns everything collected into a resume, and saves it as the profile. */
export async function POST() {
  const userId = await requireUserId();

  if (!process.env.ANTHROPIC_API_KEY) {
    return errorResponse({ type: 'auth', message: 'Your API key may be invalid or out of credits.' }, 500);
  }

  const [entryRows, factRows] = await Promise.all([getProfileEntries(userId), getActiveFacts(userId)]);

  if (factRows.length === 0) {
    return errorResponse({ type: 'generic', message: 'There is nothing to build a profile from yet.' }, 400);
  }

  const entries: ProfileEntry[] = entryRows.map((e) => ({
    id: e.id,
    kind: e.kind as ProfileEntry['kind'],
    title: e.title ?? undefined,
    org: e.org ?? undefined,
    location: e.location ?? undefined,
    datesDisplay: e.datesDisplay ?? undefined,
    orderIndex: e.orderIndex,
    source: e.source as ProfileEntry['source'],
  }));

  const facts: Fact[] = factRows.map((f) => ({
    id: f.id,
    entryId: f.entryId,
    category: f.category as Fact['category'],
    text: f.text,
    hasNumber: f.hasNumber,
    confidence: f.confidence,
    source: f.source as Fact['source'],
    sourceTurnId: f.sourceTurnId,
    status: 'active',
  }));

  try {
    const result = await composeProfile(entries, facts);

    // A bullet the model could not trace back to anything is one it invented.
    // Surfaced rather than silently shipped into someone's resume.
    const uncited = findUncitedBullets(result, facts);
    const warnings = result.warnings.map(cleanWarning).filter(Boolean);
    if (uncited.length) {
      warnings.push(
        `${uncited.length} bullet${uncited.length === 1 ? '' : 's'} could not be traced back to anything you said. Check ${uncited.length === 1 ? 'it' : 'them'} before using this resume: ${uncited.map((b) => `"${b}"`).join('; ')}`,
      );
    }

    await saveComposedProfile(
      userId,
      result.structure,
      result.bulletSources,
      profileStrength(result.structure),
    );

    return NextResponse.json({ structure: result.structure, warnings });
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
    console.error('[Resumi] Compose failed:', error);
    return errorResponse({ type: 'generic', message: SERVICE_UNAVAILABLE }, 502);
  }
}
