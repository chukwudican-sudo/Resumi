import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { NoToolUseError, callClaude } from '../../../lib/anthropic';
import { SOURCE_EXTRACTION_PROMPT } from '../../../lib/systemPrompt';
import { extractParagraphs } from '../../../lib/docxEngine';
import type { ResumeStructure } from '../../../lib/types';
import { requireUserId } from '../../../server/auth';
import { profileStrength } from '../../../lib/profileStrength';
import { replaceProfileFromResume } from '../../../server/db/repository';
import { DOCX_MIME, SOURCE_EXTRACTION_TOOL, buildDocumentBlock, errorResponse, SERVICE_UNAVAILABLE } from '../../claude/shared';

export const maxDuration = 60;

interface SourceExtraction {
  structure: ResumeStructure;
  usable: boolean;
  reason: string;
}

/**
 * Turns an uploaded resume into the person's profile.
 *
 * Replaces the old client-side extract_resume path: the structure now lands in
 * the database against the signed-in user rather than in their browser, and the
 * entries it describes become real rows so the questions can later fill in what
 * the document left out.
 */
export async function POST(request: NextRequest) {
  const userId = await requireUserId();

  if (!process.env.ANTHROPIC_API_KEY) {
    return errorResponse(
      { type: 'auth', message: 'Your API key may be invalid or out of credits. Check console.anthropic.com.' },
      500,
    );
  }

  let body: { file?: { base64?: string; mimeType?: string }; fileName?: string };
  try {
    body = await request.json();
  } catch {
    return errorResponse({ type: 'generic', message: SERVICE_UNAVAILABLE }, 400);
  }

  const file = body.file;
  if (!file?.base64 || !file?.mimeType) {
    return errorResponse({ type: 'generic', message: 'No resume file to read.' }, 400);
  }

  const content: any[] = [];
  if (file.mimeType === 'application/pdf') {
    const doc = buildDocumentBlock(file);
    if (doc) content.push(doc);
  } else if (file.mimeType === DOCX_MIME) {
    const paragraphs = await extractParagraphs(Buffer.from(file.base64, 'base64'));
    content.push({
      type: 'text',
      text: `Uploaded resume (.docx) — extracted paragraph text:\n\n${paragraphs.map((p) => p.text).join('\n')}`,
    });
  } else {
    return errorResponse({ type: 'generic', message: 'Unsupported file type. Upload a PDF or Word (.docx) resume.' }, 400);
  }

  content.push({
    type: 'text',
    text: 'Read the resume above and extract its content into ResumeStructure using the submit_source_extraction tool.',
  });

  try {
    const { toolInput } = await callClaude<SourceExtraction>({
      kind: 'extract_resume',
      system: SOURCE_EXTRACTION_PROMPT,
      content,
      tool: SOURCE_EXTRACTION_TOOL,
    });

    if (!toolInput.usable) {
      return errorResponse(
        { type: 'generic', message: toolInput.reason || "We couldn't read this file as a resume. Try a different PDF or .docx." },
        400,
      );
    }

    const structure = toolInput.structure;
    await replaceProfileFromResume(userId, structure, profileStrength(structure), body.fileName ?? 'resume');

    return NextResponse.json({ structure });
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
    console.error('[Resumi] Profile import failed:', error);
    return errorResponse({ type: 'generic', message: SERVICE_UNAVAILABLE }, 502);
  }
}
