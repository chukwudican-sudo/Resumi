import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { estimateCostUsd } from '../../lib/pricing';
import { EXTRACTION_PROMPT, SOURCE_EXTRACTION_PROMPT, UNIVERSAL_RULES } from '../../lib/systemPrompt';
// extractParagraphs pulls plain text out of a .docx Source Resume for the
// extract_resume mode. The old docx-tailoring path (buildTailoredDocx) is gone.
import { extractParagraphs } from '../../lib/docxEngine';
import { mockApiResponse } from '../../lib/mockApi';
import type { ApiErrorPayload, ResumeStructure } from '../../lib/types';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

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

// The ResumeStructure JSON-schema shape, shared by submit_source_extraction
// (extract) and submit_tailored_resume (tailor) so the two stay consistent.
const RESUME_STRUCTURE_SCHEMA = {
  type: 'object' as const,
  description: 'A resume as structured content (name, contact, sections, entries, bullets) — no layout.',
  properties: {
    name: { type: 'string', description: 'The person\'s full name. Empty string if not found.' },
    contact: {
      type: 'object',
      description: 'Contact details. Omit any field that is not present.',
      properties: {
        phone: { type: 'string' },
        email: { type: 'string' },
        linkedin: { type: 'string' },
        github: { type: 'string' },
        website: { type: 'string' },
      },
      additionalProperties: false,
    },
    summary: { type: 'string', description: 'Optional professional summary/objective. Omit if there is none.' },
    education: {
      type: 'array',
      description: 'Education entries.',
      items: {
        type: 'object',
        properties: {
          school: { type: 'string' },
          location: { type: 'string' },
          degree: { type: 'string' },
          dates: { type: 'string' },
        },
        required: ['school', 'location', 'degree', 'dates'],
        additionalProperties: false,
      },
    },
    experience: {
      type: 'array',
      description: 'Work experience entries.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          dates: { type: 'string' },
          org: { type: 'string' },
          location: { type: 'string' },
          bullets: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'dates', 'org', 'location', 'bullets'],
        additionalProperties: false,
      },
    },
    projects: {
      type: 'array',
      description: 'Project entries.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          tech: { type: 'string' },
          dates: { type: 'string' },
          bullets: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'tech', 'dates', 'bullets'],
        additionalProperties: false,
      },
    },
    skills: {
      type: 'array',
      description: 'Technical skills grouped by category.',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          items: { type: 'string', description: 'The skills in this category as a single string (e.g. comma-separated).' },
        },
        required: ['category', 'items'],
        additionalProperties: false,
      },
    },
    certifications: {
      type: 'array',
      description: 'Optional certifications. Omit if there are none.',
      items: { type: 'string' },
    },
    awards: {
      type: 'array',
      description: 'Optional awards. Omit if there are none.',
      items: { type: 'string' },
    },
  },
  required: ['name', 'contact', 'education', 'experience', 'projects', 'skills'],
  additionalProperties: false,
};

const TAILOR_TOOL: Anthropic.Tool = {
  name: 'submit_tailored_resume',
  description: 'Submit the fully tailored resume as an edited ResumeStructure along with a change log, match score, structural change flags, and any warnings.',
  input_schema: {
    type: 'object',
    properties: {
      structure: {
        ...RESUME_STRUCTURE_SCHEMA,
        description: 'The tailored resume content as a ResumeStructure — the same shape as the input structure, with fields/bullets edited for the job. Name, contact, and dates must be identical to the input.',
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
        description: 'Structural changes that require user approval before the resume is considered final. A structural change is: (1) moving a bullet from one entry into a different entry — for example, pulling a bullet from one job/project and placing it in another, OR (2) substantively renaming or repurposing a section\'s meaning. Regular bullet rewrites, reordering skills within a category, or tightening of wording are NOT structural changes — do not include them here. Empty array if no structural changes were made.',
      },
      warnings: {
        type: 'array',
        items: { type: 'string' },
        description: 'Any warnings: image-based/unreadable PDFs, blurry screenshots, rule conflicts, resume exceeding 2 pages, etc. Empty array if none.',
      },
    },
    required: [
      'structure',
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

const SOURCE_EXTRACTION_TOOL: Anthropic.Tool = {
  name: 'submit_source_extraction',
  description: 'Submit the extracted resume content as a ResumeStructure, along with whether the document was usable as a resume and, if not, the reason.',
  input_schema: {
    type: 'object',
    properties: {
      structure: {
        ...RESUME_STRUCTURE_SCHEMA,
        description: 'The extracted resume content. Return empty/default values if usable is false.',
      },
      usable: {
        type: 'boolean',
        description: 'True if the document is a readable resume that could be extracted. False if it is a scanned/image-only PDF with no text, blank/corrupt, or not a resume at all.',
      },
      reason: {
        type: 'string',
        description: 'Short plain-English reason when usable is false. Empty string when usable is true.',
      },
    },
    required: ['structure', 'usable', 'reason'],
    additionalProperties: false,
  },
};

const INSTRUCT_TOOL: Anthropic.Tool = {
  name: 'submit_resume_update',
  description: 'Submit the surgically updated ResumeStructure after acting on a single mid-session instruction.',
  input_schema: {
    type: 'object',
    properties: {
      structure: {
        ...RESUME_STRUCTURE_SCHEMA,
        description: 'The full updated resume content as a ResumeStructure — same shape as the input structure, with only the field(s) relevant to the instruction changed; everything else returned verbatim.',
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
    required: ['structure', 'log', 'estimatedPages', 'warnings'],
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
    paragraphs?: { index: number; style: string; text: string; editable: boolean }[];
    structureSummary?: string;
    content: any[];
  },
) {
  const { aboutMe, rules, jobPosting, paragraphs, structureSummary, content } = args;
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
  if (structureSummary) {
    console.log(`  Resume Structure  : ${structureSummary}`);
  }
  if (paragraphs) {
    console.log(`  Resume Paragraphs : ${paragraphs.length} extracted from the .docx —`);
    paragraphs.forEach((p) => {
      console.log(`    [${p.index}] (${p.style})${p.editable ? '' : ' [non-editable]'}: "${preview(p.text, 90)}"`);
    });
  }
  console.log(`  Content blocks sent to messages.create(): [${content.map((c) => c.type).join(', ')}] (${content.length} total)`);
}

export async function GET() {
  if (process.env.RESUMI_MOCK) return NextResponse.json({ status: 'ok' });
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
  // ponytail: offline mock — no Anthropic call, no key needed. See mockApi.ts.
  if (process.env.RESUMI_MOCK) {
    let mockBody: any;
    try { mockBody = await request.json(); } catch { mockBody = {}; }
    return NextResponse.json(mockApiResponse(mockBody));
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

    if (mode === 'extract_resume') {
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

      const response: any = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        output_config: { effort: 'low' },
        system: SOURCE_EXTRACTION_PROMPT,
        tools: [SOURCE_EXTRACTION_TOOL],
        tool_choice: { type: 'tool', name: SOURCE_EXTRACTION_TOOL.name },
        messages: [{ role: 'user', content }],
      } as any);

      const toolUse = response.content.find((block: any) => block.type === 'tool_use') as Anthropic.ToolUseBlock | undefined;
      if (!toolUse) {
        return errorResponse({ type: 'generic', message: 'The AI service is temporarily unavailable. Please try again.' }, 502);
      }

      const input = toolUse.input as { structure: ResumeStructure; usable: boolean; reason: string };
      if (!input.usable) {
        return errorResponse(
          { type: 'generic', message: input.reason || "We couldn't read this file as a resume. Try a different PDF or .docx." },
          400,
        );
      }

      return NextResponse.json({ structure: input.structure });
    }

    if (mode === 'instruct') {
      const { instruction, structure, aboutMe, rules, jobPosting } = body;
      if (!instruction || !structure) {
        return errorResponse({ type: 'generic', message: 'Missing instruction or current resume content.' }, 400);
      }

      const content: any[] = [];
      const aboutMeDoc = buildDocumentBlock(aboutMe);
      if (aboutMeDoc) content.push(aboutMeDoc);
      const rulesDoc = buildDocumentBlock(rules);
      if (rulesDoc) content.push(rulesDoc);

      const structureJson = JSON.stringify(structure, null, 2);
      content.push({
        type: 'text',
        text: [
          'Current tailored resume — the Resume Structure (structured content, no layout):',
          '```json',
          structureJson,
          '```',
          `Job posting — Company: ${jobPosting?.company || '(none)'}, Role: ${jobPosting?.role || '(none)'}\n${jobPosting?.description || '(no description provided)'}`,
          `Mid-session instruction: "${instruction}"`,
          'Apply this single instruction as a surgical edit to the structure — only touch the relevant field(s), and return the full structure via the submit_resume_update tool. Do not re-tailor the entire resume from scratch.',
        ].join('\n\n'),
      });

      const structureSummary = `name="${structure.name || '(none)'}", education=${(structure.education || []).length}, experience=${(structure.experience || []).length}, projects=${(structure.projects || []).length}, skills=${(structure.skills || []).length} categories`;
      logRequestInputs('Instruct', { aboutMe, rules, jobPosting, structureSummary, content });
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

      const input = toolUse.input as { structure: ResumeStructure; log: string[]; estimatedPages: number; warnings: string[] };

      const usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        costUsd: estimateCostUsd(response.usage.input_tokens, response.usage.output_tokens),
      };

      return NextResponse.json({
        structure: input.structure,
        log: input.log || [],
        estimatedPages: input.estimatedPages,
        warnings: input.warnings || [],
        usage,
      });
    }

    // mode === 'tailor' (default)
    const { aboutMe, rules, jobPosting, structure } = body;

    if (!aboutMe?.base64 || !structure || !jobPosting) {
      return errorResponse({ type: 'generic', message: 'Missing required inputs. Make sure About Me and a Source Resume are provided.' }, 400);
    }

    const content: any[] = [];

    const aboutMeDoc = buildDocumentBlock(aboutMe);
    if (aboutMeDoc) content.push(aboutMeDoc);
    const rulesDoc = buildDocumentBlock(rules);
    if (rulesDoc) content.push(rulesDoc);

    const images = Array.isArray(jobPosting.images) ? jobPosting.images : [];
    for (const image of images) {
      if (image?.base64) content.push(buildImageBlock(image));
    }

    const structureJson = JSON.stringify(structure, null, 2);
    const textParts = [
      "Source Resume — the current Resume Structure (structured content, no layout). This is the resume of record. Edit its fields and bullets to tailor it; keep the same overall shape:",
      '```json',
      structureJson,
      '```',
      `Job posting — Company: ${jobPosting.company || '(not provided)'}, Role: ${jobPosting.role || '(not provided)'}\n${jobPosting.description || '(no pasted text — see attached screenshots, if any)'}`,
      'Produce the tailored resume now by returning an edited ResumeStructure via the submit_tailored_resume tool. Read the About Me PDF and Resume Rules PDF (attached above) and the job posting (text and/or screenshots) before writing anything.',
    ];

    content.push({ type: 'text', text: textParts.join('\n\n') });

    const structureSummary = `name="${structure.name || '(none)'}", education=${(structure.education || []).length}, experience=${(structure.experience || []).length}, projects=${(structure.projects || []).length}, skills=${(structure.skills || []).length} categories`;
    logRequestInputs('Tailor', { aboutMe, rules, jobPosting, structureSummary, content });

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
      structure: ResumeStructure;
      log: string[];
      matchScore: number;
      missingRequirements: string[];
      vague: boolean;
      vagueReason: string;
      estimatedPages: number;
      structuralChanges: { description: string; reason: string }[];
      warnings: string[];
    };

    const usage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      costUsd: estimateCostUsd(response.usage.input_tokens, response.usage.output_tokens),
    };

    return NextResponse.json({
      structure: input.structure,
      log: input.log || [],
      matchScore: input.matchScore,
      missingRequirements: input.missingRequirements || [],
      vague: Boolean(input.vague),
      vagueReason: input.vagueReason || '',
      estimatedPages: input.estimatedPages,
      structuralChanges: input.structuralChanges || [],
      warnings: input.warnings || [],
      usage,
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
