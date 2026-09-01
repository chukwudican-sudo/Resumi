import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { NoToolUseError, callClaude } from '../../lib/anthropic';
import { EXTRACTION_PROMPT } from '../../lib/systemPrompt';
import { requireUserId } from '../../server/auth';
import { createApplication } from '../../server/db/repository';
import { EXTRACT_TOOL, buildImageBlock, errorResponse, SERVICE_UNAVAILABLE } from '../claude/shared';

export const maxDuration = 60;

interface Extraction {
  company: string;
  role: string;
  description: string;
  location: string;
  requirements: string[];
}

/**
 * Saves a job posting and opens an application against it.
 *
 * The posting text is stored rather than linked: listings come down within
 * weeks and people need them back before an interview. Its requirements are
 * extracted once, here, because that is what makes counting demand across
 * everything someone has saved possible at all — doing it later would mean
 * re-reading every posting.
 */
export async function POST(request: NextRequest) {
  const userId = await requireUserId();

  if (!process.env.ANTHROPIC_API_KEY) {
    return errorResponse({ type: 'auth', message: 'Your API key may be invalid or out of credits.' }, 500);
  }

  let body: { text?: string; images?: { base64: string; mimeType: string }[]; sourceUrl?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse({ type: 'generic', message: SERVICE_UNAVAILABLE }, 400);
  }

  const text = (body.text ?? '').trim();
  const images = Array.isArray(body.images) ? body.images : [];
  if (!text && images.length === 0) {
    return errorResponse({ type: 'generic', message: 'Paste the posting, or add a screenshot of it.' }, 400);
  }

  const content: any[] = [];
  for (const image of images) {
    if (image?.base64) content.push(buildImageBlock(image));
  }
  content.push({
    type: 'text',
    text: text
      ? `Job posting:\n${text}`
      : 'No pasted text was provided — read only the attached screenshot(s).',
  });

  try {
    const { toolInput } = await callClaude<Extraction>({
      kind: 'extract',
      system: EXTRACTION_PROMPT,
      content,
      tool: EXTRACT_TOOL,
    });

    if (!toolInput.description && !toolInput.role) {
      return errorResponse(
        { type: 'generic', message: "We couldn't find a job posting in that. Try pasting more of it." },
        400,
      );
    }

    // Stored lowercased and de-duplicated: these are counted across postings,
    // and "Docker" from one and "docker" from another must be the same thing.
    const requirements = Array.from(
      new Set((toolInput.requirements ?? []).map((r) => r.trim().toLowerCase()).filter(Boolean)),
    ).slice(0, 40);

    const applicationId = await createApplication(userId, {
      company: toolInput.company || null,
      role: toolInput.role || null,
      location: toolInput.location || null,
      description: toolInput.description || text || null,
      sourceUrl: body.sourceUrl?.trim() || null,
      requirements,
    });

    return NextResponse.json({ applicationId });
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
    console.error('[Resumi] Creating an application failed:', error);
    return errorResponse({ type: 'generic', message: SERVICE_UNAVAILABLE }, 502);
  }
}
