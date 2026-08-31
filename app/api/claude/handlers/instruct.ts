import { NextResponse } from 'next/server';
import { callClaude } from '../../../lib/anthropic';
import { UNIVERSAL_RULES } from '../../../lib/systemPrompt';
import type { ResumeStructure } from '../../../lib/types';
import {
  INSTRUCT_TOOL,
  buildDocumentBlock,
  errorResponse,
  logRequestInputs,
  summariseStructure,
} from '../shared';

interface InstructResult {
  structure: ResumeStructure;
  log: string[];
  estimatedPages: number;
  warnings: string[];
}

/** Applies a single mid-session instruction as a surgical edit. */
export async function handleInstruct(body: any) {
  const { instruction, structure, aboutMe, rules, jobPosting } = body;
  if (!instruction || !structure) {
    return errorResponse({ type: 'generic', message: 'Missing instruction or current resume content.' }, 400);
  }

  const content: any[] = [];
  const aboutMeDoc = buildDocumentBlock(aboutMe);
  if (aboutMeDoc) content.push(aboutMeDoc);
  const rulesDoc = buildDocumentBlock(rules);
  if (rulesDoc) content.push(rulesDoc);

  content.push({
    type: 'text',
    text: [
      'Current tailored resume — the Resume Structure (structured content, no layout):',
      '```json',
      JSON.stringify(structure, null, 2),
      '```',
      `Job posting — Company: ${jobPosting?.company || '(none)'}, Role: ${jobPosting?.role || '(none)'}\n${jobPosting?.description || '(no description provided)'}`,
      `Mid-session instruction: "${instruction}"`,
      'Apply this single instruction as a surgical edit to the structure — only touch the relevant field(s), and return the full structure via the submit_resume_update tool. Do not re-tailor the entire resume from scratch.',
    ].join('\n\n'),
  });

  logRequestInputs('Instruct', {
    aboutMe,
    rules,
    jobPosting,
    structureSummary: summariseStructure(structure),
    content,
  });
  console.log(`  Instruction       : "${instruction}"`);

  const { toolInput, usage } = await callClaude<InstructResult>({
    kind: 'instruct',
    system: UNIVERSAL_RULES,
    content,
    tool: INSTRUCT_TOOL,
  });

  return NextResponse.json({
    structure: toolInput.structure,
    log: toolInput.log || [],
    estimatedPages: toolInput.estimatedPages,
    warnings: toolInput.warnings || [],
    usage,
  });
}
