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

  // About Me is optional. The structure is the resume of record — it can come
  // from an uploaded resume or from the interview — and the About Me PDF only
  // ever enriched it. Requiring it would lock out anyone who built their
  // profile by being interviewed instead of by uploading a document.
  if (!structure || !jobPosting) {
    return errorResponse(
      { type: 'generic', message: 'Missing required inputs. Build or upload a resume profile first, then add a job posting.' },
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
      aboutMe?.base64
        ? 'Produce the tailored resume now by returning an edited ResumeStructure via the submit_tailored_resume tool. Read the About Me PDF and any Resume Rules PDF attached above, plus the job posting, before writing anything.'
        : 'Produce the tailored resume now by returning an edited ResumeStructure via the submit_tailored_resume tool. No About Me PDF was provided — this profile was built directly, so the structure above is your only source for what this person has done. Tailor within it and do not invent anything to fill gaps.',
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
