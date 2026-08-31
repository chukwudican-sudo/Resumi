import { NextResponse } from 'next/server';
import { callClaude } from '../../../lib/anthropic';
import { UNIVERSAL_RULES } from '../../../lib/systemPrompt';
import type { ResumeStructure } from '../../../lib/types';
import {
  TAILOR_TOOL,
  buildDocumentBlock,
  buildImageBlock,
  errorResponse,
  logRequestInputs,
  summariseStructure,
} from '../shared';

interface TailorResult {
  structure: ResumeStructure;
  log: string[];
  matchScore: number;
  missingRequirements: string[];
  vague: boolean;
  vagueReason: string;
  estimatedPages: number;
  structuralChanges: { description: string; reason: string }[];
  warnings: string[];
}

/** Tailors the source resume to a job posting. */
export async function handleTailor(body: any) {
  const { aboutMe, rules, jobPosting, structure } = body;

  if (!aboutMe?.base64 || !structure || !jobPosting) {
    return errorResponse(
      { type: 'generic', message: 'Missing required inputs. Make sure About Me and a Source Resume are provided.' },
      400,
    );
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

  content.push({
    type: 'text',
    text: [
      'Source Resume — the current Resume Structure (structured content, no layout). This is the resume of record. Edit its fields and bullets to tailor it; keep the same overall shape:',
      '```json',
      JSON.stringify(structure, null, 2),
      '```',
      `Job posting — Company: ${jobPosting.company || '(not provided)'}, Role: ${jobPosting.role || '(not provided)'}\n${jobPosting.description || '(no pasted text — see attached screenshots, if any)'}`,
      'Produce the tailored resume now by returning an edited ResumeStructure via the submit_tailored_resume tool. Read the About Me PDF and Resume Rules PDF (attached above) and the job posting (text and/or screenshots) before writing anything.',
    ].join('\n\n'),
  });

  logRequestInputs('Tailor', {
    aboutMe,
    rules,
    jobPosting,
    structureSummary: summariseStructure(structure),
    content,
  });

  const { toolInput, usage } = await callClaude<TailorResult>({
    kind: 'tailor',
    system: UNIVERSAL_RULES,
    content,
    tool: TAILOR_TOOL,
  });

  return NextResponse.json({
    structure: toolInput.structure,
    log: toolInput.log || [],
    matchScore: toolInput.matchScore,
    missingRequirements: toolInput.missingRequirements || [],
    vague: Boolean(toolInput.vague),
    vagueReason: toolInput.vagueReason || '',
    estimatedPages: toolInput.estimatedPages,
    structuralChanges: toolInput.structuralChanges || [],
    warnings: toolInput.warnings || [],
    usage,
  });
}
