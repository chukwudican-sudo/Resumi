import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { HEALTH_CHECK_MODEL, NoToolUseError } from '../../lib/anthropic';
import { mockApiResponse } from '../../lib/mockApi';
import { SERVICE_UNAVAILABLE, errorResponse } from './shared';
import { handleExtract } from './handlers/extract';
import { handleExtractResume } from './handlers/extractResume';
import { handleInstruct } from './handlers/instruct';
import { handleTailor } from './handlers/tailor';

/**
 * Every mode is dispatched from this table. Previously `tailor` was an
 * unguarded fallthrough, which meant a typo'd or missing mode silently ran the
 * most expensive path with whatever body it happened to be given. An unknown
 * mode is now a 400.
 */
const HANDLERS: Record<string, (body: any) => Promise<Response>> = {
  extract: handleExtract,
  extract_resume: handleExtractResume,
  instruct: handleInstruct,
  tailor: handleTailor,
};

export async function GET() {
  if (isMockMode()) return NextResponse.json({ status: 'ok' });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ status: 'error' });
  }
  try {
    const client = new Anthropic();
    await client.models.retrieve(HEALTH_CHECK_MODEL);
    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ status: 'error' });
  }
}

export async function POST(request: NextRequest) {
  // Offline mock — no Anthropic call, no key needed. See mockApi.ts.
  if (isMockMode()) {
    let mockBody: any;
    try { mockBody = await request.json(); } catch { mockBody = {}; }
    const mocked = mockApiResponse(mockBody);
    if (!mocked) {
      return errorResponse({ type: 'generic', message: `Unknown mode: ${mockBody?.mode ?? '(none)'}` }, 400);
    }
    return NextResponse.json(mocked);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return errorResponse(
      { type: 'auth', message: 'Your API key may be invalid or out of credits. Check console.anthropic.com.' },
      500,
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return errorResponse({ type: 'generic', message: SERVICE_UNAVAILABLE }, 400);
  }

  const handler = HANDLERS[body?.mode];
  if (!handler) {
    return errorResponse({ type: 'generic', message: `Unknown mode: ${body?.mode ?? '(none)'}` }, 400);
  }

  try {
    return await handler(body);
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

/**
 * Mock mode short-circuits before the API-key check, and would short-circuit
 * before an auth check too — so it is refused outright in production rather
 * than trusted to be unset.
 */
function isMockMode(): boolean {
  if (!process.env.RESUMI_MOCK) return false;
  if (process.env.NODE_ENV === 'production') {
    console.error('[Resumi] RESUMI_MOCK is set in production and is being ignored.');
    return false;
  }
  return true;
}
