import Anthropic from '@anthropic-ai/sdk';
import { callClaude } from './anthropic';
import type { ResumeStructure } from './types';

/**
 * Spelling, and nothing else.
 *
 * This was one of four jobs in the polish call and it was the one that got
 * dropped. Asked to proofread, group the skills, order the sections and write
 * warnings in a single response, the model reliably did the last three and
 * returned no corrections at all — on a resume containing "Dean Listst" and
 * "Ms Powerpoinnt". Given the same resume and only this to do, it found both,
 * twice out of twice.
 *
 * Four attempts at rewording the combined prompt changed nothing, which is
 * usually the sign that the structure is wrong rather than the words. So this
 * is its own call with its own tool, and there is nothing in the response for
 * attention to go to instead.
 */

export const PROOFREAD_PROMPT = `You are proofreading a resume. Spelling only.

List every misspelled word you find. A correction is the misspelled word and its fix — never a rewritten phrase, and never a sentence. You are not editing: if a line is clumsy, badly worded or too long, that is not yours to touch and an attempt to fix it here will be discarded.

Check carefully the names you do know. Universities, companies, cities, awards and honours are things you know the spelling of — "Dean Listst" is "Dean's List", "Univeristy" is "University". A misspelled award is the most embarrassing kind, because it is the part somebody was proud enough to include.

Leave alone, always:
- technical terms, libraries, tools and product names — pytest, matplotlib, RevenueCat, PostgreSQL, MealApp, FraudWatch. A spellchecker flags all of these and every "fix" would be damage.
- names you do not recognise. An unfamiliar company or product is far likelier to be spelled correctly than to be a typo you can fix.
- numbers, dates, and anything inside a web address.
- British or Canadian spellings. "organisation" and "colour" are not typos.

Return an empty list only after reading every line. Most resumes have at least one.`;

const PROOFREAD_TOOL: Anthropic.Tool = {
  name: 'submit_corrections',
  description: 'Every misspelling found in the resume, as the wrong word and its fix.',
  input_schema: {
    type: 'object',
    properties: {
      corrections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'The misspelled word, exactly as it appears.' },
            to: { type: 'string', description: 'What it should say.' },
            reason: { type: 'string', description: 'One short sentence, addressed to the person.' },
          },
          required: ['from', 'to', 'reason'],
          additionalProperties: false,
        },
      },
    },
    required: ['corrections'],
    additionalProperties: false,
  },
};

export interface Correction {
  from: string;
  to: string;
  reason: string;
}

/** Everything on the resume that is text somebody wrote, as plain lines. */
export function readableText(structure: ResumeStructure, contactName?: string): string {
  return [
    contactName ? `NAME\n${contactName}` : '',
    '',
    'SKILLS',
    ...structure.skills.map((s) => `${s.category}: ${s.items}`),
    '',
    'EDUCATION',
    ...structure.education.flatMap((e) => [e.school, e.degree, e.location, ...(e.bullets ?? [])]),
    '',
    'EXPERIENCE',
    ...structure.experience.flatMap((x) => [`${x.title} — ${x.org} — ${x.location}`, ...x.bullets]),
    '',
    'PROJECTS',
    // The url is left out on purpose: an address looks misspelled to any
    // spellchecker and "fixing" one produces a dead link.
    ...structure.projects.flatMap((p) => [`${p.name} — ${p.tech}`, ...p.bullets]),
  ]
    .filter((line) => line !== undefined)
    .join('\n');
}

export async function proofread(
  userId: string,
  structure: ResumeStructure,
  contactName?: string,
): Promise<Correction[]> {
  const { toolInput } = await callClaude<{ corrections: Correction[] }>({
    userId,
    kind: 'proofread',
    system: PROOFREAD_PROMPT,
    content: [{ type: 'text' as const, text: readableText(structure, contactName) }],
    tool: PROOFREAD_TOOL,
  });

  return Array.isArray(toolInput?.corrections) ? toolInput.corrections : [];
}
