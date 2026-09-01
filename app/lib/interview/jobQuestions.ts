import Anthropic from '@anthropic-ai/sdk';
import { callClaude } from '../anthropic';
import type { Fact, ProfileEntry, ResumeStructure, TokenUsage } from '../types';

/**
 * Questions worth asking because of a specific job.
 *
 * This is where the questions belong. Asked up front they are an intake form —
 * dozens of them, about everything, before anyone has seen a resume. Asked here
 * they are help: the posting says what matters, the resume says what is thin,
 * and the overlap is a short list of things that would visibly improve this
 * application.
 *
 * All of them at once rather than one at a time. A turn-by-turn conversation
 * costs a round trip per question, and at several seconds each that is a long
 * wait in the middle of applying for something. Three questions on one screen
 * is one wait and one decision.
 */

export const JOB_QUESTIONS_PROMPT = `You are helping someone strengthen their resume for one specific job they are applying to.

You will be given the job posting, their current resume, and the requirements the posting asks for that their resume does not mention.

Write a SHORT list of questions — at most four, fewer if that is honest — whose answers would most improve this application.

WHAT MAKES A GOOD QUESTION HERE
1. It must be about THIS job. The person is applying right now; a question that would apply to any job is a question they should not have to answer here.
2. Prefer numbers. A bullet that says what happened beats one that says what they were responsible for, and the posting usually reveals which numbers it cares about.
3. Ask about something they plausibly have. Their resume is your evidence of what they have done — reach for the entry closest to what the posting wants and probe it.
4. Never ask them to confirm something they clearly already said. Everything on their resume is shown to you.
5. Where the posting asks for something missing entirely, ask whether they have used it — do not assume either way. "Have you used Docker anywhere, even in a side project?" is fair. Implying they have is not.
6. One question at a time, plainly worded, answerable in a sentence or two.

Each question carries a short "why" that names the connection to this posting, because a question whose point is obvious gets a better answer.

If the resume already covers the posting well, return fewer questions — or none. Padding the list wastes the goodwill you need for the questions that matter.`;

export const JOB_QUESTIONS_TOOL: Anthropic.Tool = {
  name: 'submit_job_questions',
  description: 'Submit the short list of questions that would most improve this resume for this job.',
  input_schema: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        description: 'At most four. Fewer is better when the resume already fits.',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'The question, answerable in a sentence or two.' },
            why: {
              type: 'string',
              description: 'One short line naming what in the posting makes this worth asking.',
            },
            about: {
              type: 'string',
              description:
                'Which entry on their resume this concerns, by its title. Empty when it is about them generally.',
            },
          },
          required: ['text', 'why', 'about'],
          additionalProperties: false,
        },
      },
    },
    required: ['questions'],
    additionalProperties: false,
  },
};

export interface JobQuestion {
  text: string;
  why: string;
  about: string;
}

export async function generateJobQuestions(input: {
  posting: { company: string | null; role: string | null; description: string | null };
  resume: ResumeStructure;
  missingRequirements: string[];
}): Promise<{ questions: JobQuestion[]; usage: TokenUsage }> {
  const content = [
    {
      type: 'text' as const,
      text: [
        `Job posting — ${input.posting.role ?? 'role not stated'} at ${input.posting.company ?? 'company not stated'}`,
        input.posting.description ?? '(no description captured)',
        '',
        'Their resume as it stands:',
        '```json',
        JSON.stringify(input.resume, null, 2),
        '```',
        input.missingRequirements.length
          ? `The posting asks for these, and the resume does not mention them: ${input.missingRequirements.join(', ')}`
          : 'Nothing the posting asks for is missing outright, so look for what is thin rather than what is absent.',
        '',
        'Return the questions via submit_job_questions.',
      ].join('\n'),
    },
  ];

  const { toolInput, usage } = await callClaude<{ questions: JobQuestion[] }>({
    kind: 'interview_turn',
    system: JOB_QUESTIONS_PROMPT,
    content,
    tool: JOB_QUESTIONS_TOOL,
    maxTokens: 1500,
  });

  return { questions: (toolInput.questions ?? []).slice(0, 4), usage };
}

// ── Turning the answers into facts ─────────────────────────────────────────

export const EXTRACT_ANSWERS_PROMPT = `You are recording what someone just told you about their work, so it can be used on their resume.

You will be given questions they were asked and the answers they gave.

Record atomic facts — one piece of information each, in their own words. Never invent, never round up, never infer a number that was not given. An empty list is the correct answer for an answer that said nothing substantive, including "no", "not really", or "I haven't".

If someone says they have NOT done something, record nothing for it. Their saying no is not a fact about their experience; it just means the resume should stay as it is.

Set hasNumber only when the text carries a real quantity. A year is not a quantity.`;

export const EXTRACT_ANSWERS_TOOL: Anthropic.Tool = {
  name: 'submit_answer_facts',
  description: 'Record the facts contained in the answers. Empty array when nothing substantive was said.',
  input_schema: {
    type: 'object',
    properties: {
      facts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string', description: "One piece of information, in the person's own terms." },
            category: {
              type: 'string',
              enum: ['action', 'metric', 'scope', 'tooling', 'outcome', 'context', 'skill', 'credential'],
            },
            about: {
              type: 'string',
              description: 'The resume entry title this belongs to, or empty if it is about them generally.',
            },
          },
          required: ['text', 'category', 'about'],
          additionalProperties: false,
        },
      },
    },
    required: ['facts'],
    additionalProperties: false,
  },
};

export interface AnswerFact {
  text: string;
  category: Fact['category'];
  about: string;
}

export async function extractAnswerFacts(
  pairs: { question: string; answer: string }[],
  entries: ProfileEntry[],
): Promise<{ facts: AnswerFact[]; usage: TokenUsage }> {
  const content = [
    {
      type: 'text' as const,
      text: [
        'Their resume entries, so you can attach facts to the right one:',
        entries.map((e) => `- ${[e.title, e.org].filter(Boolean).join(' at ')}`).join('\n') || '(none)',
        '',
        'What they were asked, and what they said:',
        ...pairs.map((p) => `Q: ${p.question}\nA: ${p.answer || '(no answer)'}`),
        '',
        'Record the facts via submit_answer_facts.',
      ].join('\n'),
    },
  ];

  const { toolInput, usage } = await callClaude<{ facts: AnswerFact[] }>({
    kind: 'interview_turn',
    system: EXTRACT_ANSWERS_PROMPT,
    content,
    tool: EXTRACT_ANSWERS_TOOL,
    maxTokens: 2000,
  });

  return { facts: toolInput.facts ?? [], usage };
}
