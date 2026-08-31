import Anthropic from '@anthropic-ai/sdk';
import { callClaude } from '../anthropic';
import { RESUME_STRUCTURE_SCHEMA } from '../../api/claude/shared';
import type { Fact, ProfileEntry, ResumeStructure, TokenUsage } from '../types';

/**
 * Turns collected facts into a ResumeStructure.
 *
 * This is the one place in the interview flow where the model writes prose
 * rather than recording what it was told, so it is also the one place that can
 * fabricate. Composing is riskier than editing: joining "led a team of four"
 * and "cut latency 30%" into a single bullet asserts a causal link nobody
 * claimed. The defence is provenance — every bullet must name the fact ids it
 * came from, which makes an unsupported bullet visible rather than plausible.
 */

export const COMPOSE_PROMPT = `You are turning a set of collected facts about a person into a structured resume.

These facts were gathered in an interview. They are raw and atomic — your job is to organise and phrase them, not to invent anything.

RULES
1. Every bullet must be supported by facts you were given. Never add an achievement, a number, a tool, or an outcome that is not in the facts.
2. Never combine two facts in a way that implies a causal link neither one states. If a fact says the team was four people and another says latency fell 30%, those are two bullets unless a fact actually connects them.
3. Use the person's real name, contact details, and dates exactly as recorded. Never adjust a date.
4. Write bullets in the standard resume register: strong verb first, concrete, past tense for finished work. No first-person pronouns, no filler.
5. Lead each entry with its strongest bullet — usually the one carrying a real number.
6. A fact marked as having no number is still usable; just do not imply a quantity it does not state.
7. Group skills into a few sensible categories. Only include skills the facts support.
8. Use Canadian English spelling.
9. Aim for one page unless the person clearly has enough experience for two.

PROVENANCE
For every bullet you write, record which fact ids it came from in bulletSources. A bullet with no supporting fact ids is not allowed. If you find yourself wanting to write something you cannot cite, leave it out.`;

const COMPOSE_TOOL: Anthropic.Tool = {
  name: 'submit_composed_profile',
  description: 'Submit the resume composed from the collected facts, with each bullet traced back to the facts that support it.',
  input_schema: {
    type: 'object',
    properties: {
      structure: {
        ...RESUME_STRUCTURE_SCHEMA,
        description: 'The resume composed from the facts. Every bullet must be supported by facts provided.',
      },
      bulletSources: {
        type: 'array',
        description: 'One entry per bullet written, naming the facts that support it. Every bullet must appear here.',
        items: {
          type: 'object',
          properties: {
            section: { type: 'string', enum: ['experience', 'projects'] },
            entryIndex: { type: 'integer', description: 'Index of the entry within its section array.' },
            bulletIndex: { type: 'integer', description: 'Index of the bullet within that entry.' },
            factIds: { type: 'array', items: { type: 'string' }, description: 'Ids of the facts this bullet came from. Never empty.' },
          },
          required: ['section', 'entryIndex', 'bulletIndex', 'factIds'],
          additionalProperties: false,
        },
      },
      warnings: {
        type: 'array',
        items: { type: 'string' },
        description: 'Anything thin or missing that the person should know about — an entry with no metric, a gap in dates, too little to write about.',
      },
    },
    required: ['structure', 'bulletSources', 'warnings'],
    additionalProperties: false,
  },
};

export interface BulletSource {
  section: 'experience' | 'projects';
  entryIndex: number;
  bulletIndex: number;
  factIds: string[];
}

export interface ComposeResult {
  structure: ResumeStructure;
  bulletSources: BulletSource[];
  warnings: string[];
  usage: TokenUsage;
}

/** Renders entries and their facts, with ids, so bullets can cite them. */
function renderFacts(entries: ProfileEntry[], facts: Fact[]): string {
  const active = facts.filter((f) => f.status === 'active');
  const lines: string[] = [];

  const globals = active.filter((f) => !f.entryId);
  if (globals.length) {
    lines.push('ABOUT THE PERSON');
    for (const f of globals) lines.push(`  [${f.id}] (${f.category}) ${f.text}`);
    lines.push('');
  }

  for (const entry of [...entries].sort((a, b) => a.orderIndex - b.orderIndex)) {
    const header = [entry.title, entry.org].filter(Boolean).join(' at ') || `(untitled ${entry.kind})`;
    lines.push(`${entry.kind.toUpperCase()}: ${header}${entry.datesDisplay ? ` — ${entry.datesDisplay}` : ''}${entry.location ? ` (${entry.location})` : ''}`);
    const own = active.filter((f) => f.entryId === entry.id);
    if (own.length === 0) {
      lines.push('  (no facts recorded — omit this entry unless its header alone is worth listing)');
    } else {
      for (const f of own) lines.push(`  [${f.id}] (${f.category}) ${f.text}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export async function composeProfile(entries: ProfileEntry[], facts: Fact[]): Promise<ComposeResult> {
  const content = [
    {
      type: 'text' as const,
      text: [
        'Compose a resume from the facts below. Each fact is prefixed with its id in square brackets — cite those ids in bulletSources.',
        '',
        renderFacts(entries, facts),
        'Return the composed resume via the submit_composed_profile tool.',
      ].join('\n'),
    },
  ];

  const { toolInput, usage } = await callClaude<{
    structure: ResumeStructure;
    bulletSources: BulletSource[];
    warnings: string[];
  }>({
    kind: 'compose',
    system: COMPOSE_PROMPT,
    content,
    tool: COMPOSE_TOOL,
  });

  return {
    structure: toolInput.structure,
    bulletSources: toolInput.bulletSources ?? [],
    warnings: toolInput.warnings ?? [],
    usage,
  };
}

/**
 * Bullets the model wrote without citing any fact.
 *
 * The tool schema requires a citation for every bullet, but a schema cannot
 * enforce that the citations are complete or real, so this checks after the
 * fact. Anything listed here is unsupported by the interview and should be
 * surfaced to the user rather than shipped quietly into their resume.
 */
export function findUncitedBullets(result: ComposeResult, facts: Fact[]): string[] {
  const factIds = new Set(facts.map((f) => f.id));
  const cited = new Map<string, string[]>();
  for (const source of result.bulletSources) {
    cited.set(`${source.section}:${source.entryIndex}:${source.bulletIndex}`, source.factIds);
  }

  const problems: string[] = [];
  const sections: ('experience' | 'projects')[] = ['experience', 'projects'];

  for (const section of sections) {
    const entries = result.structure[section] ?? [];
    entries.forEach((entry, entryIndex) => {
      (entry.bullets ?? []).forEach((bullet, bulletIndex) => {
        const ids = cited.get(`${section}:${entryIndex}:${bulletIndex}`);
        if (!ids || ids.length === 0) {
          problems.push(bullet);
          return;
        }
        if (!ids.some((id) => factIds.has(id))) problems.push(bullet);
      });
    });
  }

  return problems;
}
