import { NextResponse } from 'next/server';
import { callClaude } from '../../../lib/anthropic';
import { EXTRACTION_PROMPT } from '../../../lib/systemPrompt';
import { EXTRACT_TOOL, buildImageBlock, errorResponse } from '../shared';

interface ExtractionResult {
  company: string;
  role: string;
  description: string;
}

/** Reads a job posting out of screenshots and/or pasted text. */
export async function handleExtract(body: any) {
  const { images, text } = body;
  const imageList = Array.isArray(images) ? images : [];
  if (imageList.length === 0 && !text) {
    return errorResponse({ type: 'generic', message: 'No images or text to extract from.' }, 400);
  }

  const content: any[] = [];
  for (const image of imageList) {
    if (image?.base64) content.push(buildImageBlock(image));
  }
  content.push({
    type: 'text',
    text: text
      ? `Pasted text alongside the screenshots (if any):\n${text}`
      : 'No pasted text was provided — read only the attached screenshot(s).',
  });

  const { toolInput } = await callClaude<ExtractionResult>({
    kind: 'extract',
    system: EXTRACTION_PROMPT,
    content,
    tool: EXTRACT_TOOL,
  });

  return NextResponse.json({
    company: toolInput.company || '',
    role: toolInput.role || '',
    description: toolInput.description || '',
  });
}
