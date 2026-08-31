import { NextResponse } from 'next/server';
import { callClaude } from '../../../lib/anthropic';
import { SOURCE_EXTRACTION_PROMPT } from '../../../lib/systemPrompt';
import { extractParagraphs } from '../../../lib/docxEngine';
import type { ResumeStructure } from '../../../lib/types';
import { DOCX_MIME, SOURCE_EXTRACTION_TOOL, buildDocumentBlock, errorResponse } from '../shared';

interface SourceExtractionResult {
  structure: ResumeStructure;
  usable: boolean;
  reason: string;
}

/** Parses an uploaded resume (PDF or .docx) into a ResumeStructure. */
export async function handleExtractResume(body: any) {
  const { file } = body;
  if (!file?.base64 || !file?.mimeType) {
    return errorResponse({ type: 'generic', message: 'No resume file to extract from.' }, 400);
  }

  const content: any[] = [];
  if (file.mimeType === 'application/pdf') {
    const doc = buildDocumentBlock(file);
    if (doc) content.push(doc);
  } else if (file.mimeType === DOCX_MIME) {
    // Claude cannot read .docx natively — parse the paragraph text out of the
    // OOXML ourselves and send it as plain text.
    const paragraphs = await extractParagraphs(Buffer.from(file.base64, 'base64'));
    const text = paragraphs.map((p) => p.text).join('\n');
    content.push({ type: 'text', text: `Uploaded resume (.docx) — extracted paragraph text:\n\n${text}` });
  } else {
    return errorResponse({ type: 'generic', message: 'Unsupported file type. Upload a PDF or Word (.docx) resume.' }, 400);
  }

  content.push({
    type: 'text',
    text: 'Read the resume above and extract its content into ResumeStructure using the submit_source_extraction tool.',
  });

  const { toolInput } = await callClaude<SourceExtractionResult>({
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

  return NextResponse.json({ structure: toolInput.structure });
}
