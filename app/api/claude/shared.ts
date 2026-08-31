import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { ApiErrorPayload } from '../../lib/types';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function errorResponse(payload: ApiErrorPayload, status: number) {
  return NextResponse.json({ error: payload }, { status });
}

/** Standard message for a transient upstream failure. Used in several places. */
export const SERVICE_UNAVAILABLE = 'The AI service is temporarily unavailable. Please try again.';

export function buildDocumentBlock(file: { base64?: string; mimeType?: string } | undefined) {
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

export function buildImageBlock(image: { base64: string; mimeType: string }) {
  return {
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: image.mimeType as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif',
      data: image.base64,
    },
  };
}

// The ResumeStructure JSON-schema shape, shared by every tool that reads or
// writes a resume (source extraction, tailor, instruct, and later the
// interview's compose step) so they cannot drift apart.
export const RESUME_STRUCTURE_SCHEMA = {
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

export const TAILOR_TOOL: Anthropic.Tool = {
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

export const EXTRACT_TOOL: Anthropic.Tool = {
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

export const SOURCE_EXTRACTION_TOOL: Anthropic.Tool = {
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

export const INSTRUCT_TOOL: Anthropic.Tool = {
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
export function logRequestInputs(
  label: string,
  args: {
    aboutMe: { base64?: string; mimeType?: string };
    rules: { base64?: string; mimeType?: string };
    jobPosting: { company?: string; role?: string; description?: string; images?: unknown[] };
    structureSummary?: string;
    content: any[];
  },
) {
  const { aboutMe, rules, jobPosting, structureSummary, content } = args;
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
  console.log(`  Content blocks sent to messages.create(): [${content.map((c) => c.type).join(', ')}] (${content.length} total)`);
}

/** One-line summary of a structure, for the request log. */
export function summariseStructure(structure: any): string {
  return `name="${structure?.name || '(none)'}", education=${(structure?.education || []).length}, experience=${(structure?.experience || []).length}, projects=${(structure?.projects || []).length}, skills=${(structure?.skills || []).length} categories`;
}
