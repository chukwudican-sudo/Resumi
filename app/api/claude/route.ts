import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { estimateCostUsd } from '../../lib/pricing';
import { buildParagraphPromptBlock, EXTRACTION_PROMPT, UNIVERSAL_RULES } from '../../lib/systemPrompt';
import { buildTailoredDocx, extractParagraphs } from '../../lib/docxEngine';
import type { ApiErrorPayload, DebugInfo } from '../../lib/types';

const MODEL = 'claude-sonnet-4-6';

function buildDocumentBlock(file: { base64?: string; mimeType?: string }) {
  if (!file?.base64) return null;
  return {
    type: 'document' as const,
    source: {
      type: 'base64' as const,
      media_type: (file.mimeType || 'application/pdf') as 'application/pdf',
      data: file.base64,
    },
  };
}

function buildImageBlock(image: { base64: string; mimeType: string }) {
  return {
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: image.mimeType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
      data: image.base64,
    },
  };
}

const TAILOR_TOOL: Anthropic.Tool = {
  name: 'submit_tailored_resume',
  description: 'Submit the fully tailored resume paragraph text along with a change log, match score, structural change flags, and any warnings.',
  input_schema: {
    type: 'object',
    properties: {
      paragraphs: {
        type: 'array',
        items: { type: 'string' },
        description: 'Full paragraph array, same length and order as the input paragraph structure. Unchanged paragraphs returned verbatim.',
      },
      safeParagraphs: {
        type: 'array',
        items: { type: 'string' },
        description: 'Same length and order as paragraphs, but with any structural changes reverted to their original paragraph assignment. Identical to paragraphs if there were no structural changes.',
      },
      log: {
        type: 'array',
        items: { type: 'string' },
        description: 'Plain-English bullet list of every content change made and why, in Canadian English. No leading bullet characters needed. General tailoring changes (rewording bullets, reordering skills, tightening language) go here. Do NOT log structural changes here instead of in structuralChanges — if a change qualifies as structural, it must appear in structuralChanges (not only in log).',
      },
      matchScore: {
        type: 'integer',
        description: 'Rough 0-100 estimate of how many key job requirements are covered by the tailored resume.',
      },
      missingRequirements: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific named skills/requirements from the job posting that are not present in the About Me PDF or Base Resume (e.g. "Docker", "CI/CD experience"). Empty array if the resume already covers everything material.',
      },
      vague: {
        type: 'boolean',
        description: 'True if the job posting lacks enough detail to tailor effectively.',
      },
      vagueReason: {
        type: 'string',
        description: 'Explain why the job posting is vague. Empty string if vague is false.',
      },
      estimatedPages: {
        type: 'integer',
        description: 'Estimated resume length in pages (1, 2, or 3+) based on word/character count.',
      },
      structuralChanges: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string', description: 'One sentence describing what was moved or changed structurally.' },
            reason: { type: 'string', description: 'Why this structural change was necessary to improve the match.' },
          },
          required: ['description', 'reason'],
          additionalProperties: false,
        },
        description: 'Structural changes that require user approval before the resume is considered final. A structural change is: (1) moving content from one paragraph slot into a different paragraph slot — for example, pulling a bullet from one job entry and placing it in another, OR (2) substantively renaming a section header so its meaning changes (e.g. "Experience" → "Relevant Experience"). Regular bullet rewrites, skill reordering within a paragraph, or tightening of wording are NOT structural changes — do not include them here. If you made a structural change, you MUST add it here AND include a corresponding entry in safeParagraphs that reverts that specific change while keeping all other tailoring. Empty array if no structural changes were made.',
      },
      warnings: {
        type: 'array',
        items: { type: 'string' },
        description: 'Any warnings: image-based/unreadable PDFs, blurry screenshots, rule conflicts, resume exceeding 2 pages, etc. Empty array if none.',
      },
    },
    required: [
      'paragraphs',
      'safeParagraphs',
      'log',
      'matchScore',
      'missingRequirements',
      'vague',
      'vagueReason',
      'estimatedPages',
      'structuralChanges',
      'warnings',
    ],
    additionalProperties: false,
  },
};

const EXTRACT_TOOL: Anthropic.Tool = {
  name: 'submit_job_posting_extraction',
  description: 'Submit the company name, role title, and full relevant job description extracted from the attached screenshots and/or pasted text.',
  input_schema: {
    type: 'object',
    properties: {
      company: { type: 'string', description: 'The company name. Empty string if not confidently detected.' },
      role: { type: 'string', description: 'The role/job title. Empty string if not confidently detected.' },
      description: {
        type: 'string',
        description: 'The full relevant job description — responsibilities, requirements, qualifications, nice-to-haves. Boilerplate, benefits, and legal text stripped out. Empty string if no usable job content was found.',
      },
    },
    required: ['company', 'role', 'description'],
    additionalProperties: false,
  },
};

const INSTRUCT_TOOL: Anthropic.Tool = {
  name: 'submit_resume_update',
  description: 'Submit the surgically updated resume paragraph text after acting on a single mid-session instruction.',
  input_schema: {
    type: 'object',
    properties: {
      paragraphs: {
        type: 'array',
        items: { type: 'string' },
        description: 'Full paragraph array, same length and order as the input. Only the relevant paragraph(s) change; everything else is returned verbatim.',
      },
      log: {
        type: 'array',
        items: { type: 'string' },
        description: 'Plain-English description of what changed and why, in Canadian English.',
      },
      estimatedPages: {
        type: 'integer',
        description: 'Estimated resume length in pages (1, 2, or 3+) after this edit.',
      },
      warnings: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['paragraphs', 'log', 'estimatedPages', 'warnings'],
    additionalProperties: false,
  },
};

function errorResponse(payload: ApiErrorPayload, status: number) {
  return NextResponse.json({ error: payload }, { status });
}

function kb(base64: string | undefined): string {
  if (!base64) return '0KB';
  return `${Math.round((base64.length * 0.75) / 1024)}KB`;
}

function preview(text: string | undefined, length = 160): string {
  if (!text) return '(empty)';
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

/**
 * Prints exactly what's about to be sent to Claude for a tailor/instruct
 * call. PDFs (About Me, Rules) are sent as opaque base64 `document` blocks —
 * Claude reads them natively and the server never parses their text, so we
 * can only confirm presence/size here, not list their internal sections.
 */
function logRequestInputs(
  label: string,
  args: {
    aboutMe: { base64?: string; mimeType?: string };
    rules: { base64?: string; mimeType?: string };
    jobPosting: { company?: string; role?: string; description?: string; images?: unknown[] };
    paragraphs: { index: number; style: string; text: string; editable: boolean }[];
    content: any[];
  },
) {
  const { aboutMe, rules, jobPosting, paragraphs, content } = args;
  console.log(`\n[Resumi] ${label} — inputs being sent to Claude`);
  console.log(
    `  About Me PDF      : ${aboutMe?.base64 ? `present (${kb(aboutMe.base64)}, ${aboutMe.mimeType || 'application/pdf'}) — sent as a document block; content is opaque to the server, Claude reads it natively` : 'MISSING'}`,
  );
  console.log(
    `  Resume Rules PDF  : ${rules?.base64 ? `present (${kb(rules.base64)}, ${rules.mimeType || 'application/pdf'}) — sent as a document block; content is opaque to the server, Claude reads it natively` : 'not provided (optional — skipped)'}`,
  );
  console.log(
    `  Job Posting       : company="${jobPosting?.company || '(none)'}", role="${jobPosting?.role || '(none)'}", description=${jobPosting?.description?.length || 0} chars, screenshots=${jobPosting?.images?.length || 0}`,
  );
  console.log(`  Job Posting text  : "${preview(jobPosting?.description)}"`);
  console.log(`  Resume Paragraphs : ${paragraphs.length} extracted from the .docx —`);
  paragraphs.forEach((p) => {
    console.log(`    [${p.index}] (${p.style})${p.editable ? '' : ' [non-editable]'}: "${preview(p.text, 90)}"`);
  });
  console.log(`  Content blocks sent to messages.create(): [${content.map((c) => c.type).join(', ')}] (${content.length} total)`);
}

export async function GET() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ status: 'error' });
  }
  try {
    const client = new Anthropic();
    await client.models.retrieve(MODEL);
    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ status: 'error' });
  }
}

export async function POST(request: NextRequest) {
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
    return errorResponse({ type: 'generic', message: 'The AI service is temporarily unavailable. Please try again.' }, 400);
  }

  const { mode } = body;

  try {
    const client = new Anthropic();

    if (mode === 'extract') {
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

      const response: any = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        output_config: { effort: 'low' },
        system: EXTRACTION_PROMPT,
        tools: [EXTRACT_TOOL],
        tool_choice: { type: 'tool', name: EXTRACT_TOOL.name },
        messages: [{ role: 'user', content }],
      } as any);

      const toolUse = response.content.find((block: any) => block.type === 'tool_use') as Anthropic.ToolUseBlock | undefined;
      if (!toolUse) {
        return errorResponse({ type: 'generic', message: 'The AI service is temporarily unavailable. Please try again.' }, 502);
      }

      const input = toolUse.input as { company: string; role: string; description: string };
      return NextResponse.json({
        company: input.company || '',
        role: input.role || '',
        description: input.description || '',
      });
    }

    if (mode === 'instruct') {
      const { instruction, currentDocxBase64, baseResumeBase64, aboutMe, rules, jobPosting } = body;
      if (!instruction || !currentDocxBase64 || !baseResumeBase64) {
        return errorResponse({ type: 'generic', message: 'Missing instruction or current resume content.' }, 400);
      }

      const currentBuffer = Buffer.from(currentDocxBase64, 'base64');
      const originalBuffer = Buffer.from(baseResumeBase64, 'base64');
      const paragraphs = await extractParagraphs(currentBuffer);

      const content: any[] = [];
      const aboutMeDoc = buildDocumentBlock(aboutMe);
      if (aboutMeDoc) content.push(aboutMeDoc);
      const rulesDoc = buildDocumentBlock(rules);
      if (rulesDoc) content.push(rulesDoc);

      content.push({
        type: 'text',
        text: [
          buildParagraphPromptBlock(paragraphs),
          `Job posting — Company: ${jobPosting?.company || '(none)'}, Role: ${jobPosting?.role || '(none)'}\n${jobPosting?.description || '(no description provided)'}`,
          `Alex's mid-session instruction: "${instruction}"`,
          'Apply this instruction with a surgical edit — do not re-tailor the entire resume from scratch. Only touch the relevant paragraph(s).',
        ].join('\n\n'),
      });

      logRequestInputs('Instruct', { aboutMe, rules, jobPosting, paragraphs, content });
      console.log(`  Instruction       : "${instruction}"`);

      const response: any = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        output_config: { effort: 'medium' },
        system: UNIVERSAL_RULES,
        tools: [INSTRUCT_TOOL],
        tool_choice: { type: 'tool', name: INSTRUCT_TOOL.name },
        messages: [{ role: 'user', content }],
      } as any);

      const toolUse = response.content.find((block: any) => block.type === 'tool_use') as Anthropic.ToolUseBlock | undefined;
      if (!toolUse) {
        return errorResponse({ type: 'generic', message: 'The AI service is temporarily unavailable. Please try again.' }, 502);
      }

      const input = toolUse.input as { paragraphs: string[]; log: string[]; estimatedPages: number; warnings: string[] };
      const updatedDocx = await buildTailoredDocx(originalBuffer, input.paragraphs || []);

      const usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        costUsd: estimateCostUsd(response.usage.input_tokens, response.usage.output_tokens),
      };

      return NextResponse.json({
        updatedDocxBase64: updatedDocx.toString('base64'),
        log: input.log || [],
        estimatedPages: input.estimatedPages,
        warnings: input.warnings || [],
        usage,
      });
    }

    // mode === 'tailor' (default)
    const { aboutMe, rules, jobPosting, baseResume } = body;

    if (!aboutMe?.base64 || !baseResume?.base64 || !jobPosting) {
      return errorResponse({ type: 'generic', message: 'Missing required documents. Make sure About Me and Base Resume are uploaded.' }, 400);
    }

    const originalBuffer = Buffer.from(baseResume.base64, 'base64');
    const paragraphs = await extractParagraphs(originalBuffer);

    const content: any[] = [];

    const aboutMeDoc = buildDocumentBlock(aboutMe);
    if (aboutMeDoc) content.push(aboutMeDoc);
    const rulesDoc = buildDocumentBlock(rules);
    if (rulesDoc) content.push(rulesDoc);

    const images = Array.isArray(jobPosting.images) ? jobPosting.images : [];
    for (const image of images) {
      if (image?.base64) content.push(buildImageBlock(image));
    }

    const textParts = [
      buildParagraphPromptBlock(paragraphs),
      `Job posting — Company: ${jobPosting.company || '(not provided)'}, Role: ${jobPosting.role || '(not provided)'}\n${jobPosting.description || '(no pasted text — see attached screenshots, if any)'}`,
      'Produce the tailored resume now. Read the About Me PDF and Resume Rules PDF (attached above) and the job posting (text and/or screenshots) before writing anything.',
    ];

    content.push({ type: 'text', text: textParts.join('\n\n') });

    logRequestInputs('Tailor', { aboutMe, rules, jobPosting, paragraphs, content });

    const response: any = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: 'medium' },
      system: UNIVERSAL_RULES,
      tools: [TAILOR_TOOL],
      tool_choice: { type: 'tool', name: TAILOR_TOOL.name },
      messages: [{ role: 'user', content }],
    } as any);

    const toolUse = response.content.find((block: any) => block.type === 'tool_use') as Anthropic.ToolUseBlock | undefined;
    if (!toolUse) {
      return errorResponse({ type: 'generic', message: 'The AI service is temporarily unavailable. Please try again.' }, 502);
    }

    const input = toolUse.input as {
      paragraphs: string[];
      safeParagraphs: string[];
      log: string[];
      matchScore: number;
      missingRequirements: string[];
      vague: boolean;
      vagueReason: string;
      estimatedPages: number;
      structuralChanges: { description: string; reason: string }[];
      warnings: string[];
    };

    // Compute which paragraphs Claude actually changed (for the debug panel).
    const changedIndices: number[] = [];
    for (let i = 0; i < paragraphs.length; i++) {
      const original = paragraphs[i].text.trim();
      const returned = ((input.paragraphs || [])[i] ?? '').trim();
      if (original !== returned) changedIndices.push(i);
    }

    const debugInfo: DebugInfo = {
      sentAt: new Date().toISOString(),
      aboutMePresent: Boolean(aboutMe?.base64),
      aboutMeSizeKb: aboutMe?.base64 ? Math.round((aboutMe.base64.length * 0.75) / 1024) : 0,
      rulesPresent: Boolean(rules?.base64),
      rulesSizeKb: rules?.base64 ? Math.round((rules.base64.length * 0.75) / 1024) : 0,
      jobCompany: jobPosting.company || '',
      jobRole: jobPosting.role || '',
      jobDescriptionChars: (jobPosting.description || '').length,
      jobDescriptionPreview: (jobPosting.description || '').slice(0, 200),
      jobImageCount: images.length,
      paragraphCount: paragraphs.length,
      editableParagraphCount: paragraphs.filter((p) => p.editable).length,
      paragraphsPreview: paragraphs
        .slice(0, 5)
        .map((p) => `[${p.index}] (${p.style})${p.editable ? '' : ' [non-editable]'}: ${p.text.slice(0, 60)}`)
        .join('\n'),
      claudeParagraphsReturned: (input.paragraphs || []).length,
      claudeChangedCount: changedIndices.length,
      claudeChangedIndices: changedIndices,
      claudeLogPreview: (input.log || []).slice(0, 3).join(' | ').slice(0, 200),
      claudeMatchScore: input.matchScore ?? null,
      claudeVague: Boolean(input.vague),
    };

    const [tailoredDocx, safeDocx] = await Promise.all([
      buildTailoredDocx(originalBuffer, input.paragraphs || []),
      buildTailoredDocx(originalBuffer, input.safeParagraphs || input.paragraphs || []),
    ]);

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      costUsd: estimateCostUsd(response.usage.input_tokens, response.usage.output_tokens),
    };

    return NextResponse.json({
      tailoredDocxBase64: tailoredDocx.toString('base64'),
      safeDocxBase64: safeDocx.toString('base64'),
      log: input.log || [],
      matchScore: input.matchScore,
      missingRequirements: input.missingRequirements || [],
      vague: Boolean(input.vague),
      vagueReason: input.vagueReason || '',
      estimatedPages: input.estimatedPages,
      structuralChanges: input.structuralChanges || [],
      warnings: input.warnings || [],
      usage,
      debugInfo,
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return errorResponse({ type: 'auth', message: 'Your API key may be invalid or out of credits. Check console.anthropic.com.' }, 401);
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return errorResponse({ type: 'network', message: 'Your internet connection dropped. Please check your connection.' }, 503);
    }
    return errorResponse({ type: 'generic', message: 'The AI service is temporarily unavailable. Please try again.' }, 502);
  }
}
