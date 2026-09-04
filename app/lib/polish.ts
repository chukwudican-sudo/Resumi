import Anthropic from '@anthropic-ai/sdk';
import { callClaude } from './anthropic';
import type { ResumeStructure } from './types';

/**
 * The editorial pass over a resume nobody has a job posting for yet.
 *
 * Typing your history into a form gets you the facts. It does not get you a
 * resume: "Oshawa, ON" rather than "Oshawa, Ontario, Canada", skills gathered
 * into named groups rather than listed as sentences, projects above experience
 * when the projects are the stronger evidence. Those are editorial judgments,
 * and asking someone to make them in a form is asking them to do the job they
 * came here to avoid.
 *
 * What makes this safe is that the model never sees a bullet come back out of
 * it. The tool below cannot return prose from the resume — only a regrouping of
 * skills, an ordering of sections, and a short list of proposed corrections.
 * The app applies those to the structure itself. So the failure mode of a bad
 * response is a poor grouping, not a sentence you never wrote appearing under
 * your name.
 *
 * Rewriting bullets is a different job, it requires a job posting to rewrite
 * *toward*, and it lives in the tailor path.
 */

export const POLISH_PROMPT = `You are preparing someone's master resume for presentation. They typed their history into a form; you decide how it reads.

You are NOT rewriting their content. You never see their bullets come back to you, and you must not attempt to restate, summarise or improve them. Your job is organisation and notation only.

WHAT YOU DECIDE

1. SKILL GROUPS. You are given the skills they listed, often as loose phrases or whole sentences ("Uses Python for backend algorithm work"). Pull out the actual skill terms and gather them into a few named groups.
   - Group names are yours to choose and they matter. "Languages", "Frameworks", "Tools & Practices", "Concepts" are ordinary and fine. A name like "AI & Security" is better when it makes a real strength legible instead of leaving it buried in a list. Choose names that describe THIS person.
   - Aim for three to five groups. One group of thirty items is a wall; nine groups of two is noise.
   - Order the groups so the ones a reader should see first come first, and order items within a group the same way.
   - Every term you emit must appear in the skills you were given. Do not add a skill because it would fit a group nicely. Do not list the same term in two groups.
   - Write terms the way the industry writes them: "PostgreSQL" not "postgres", "REST API design" not "rest apis".

2. SECTION ORDER AND NAMES. Decide the order of education, experience, projects and skills, and what each section is called.

   Work it out in this order, and follow it:
   a. Is there a degree in progress, or one finished within roughly the last year? If so, EDUCATION GOES FIRST. A student is read as a student, and burying the degree makes a reader hunt for the thing that explains the rest of the page. Only someone several years past graduating puts education below their work.
   b. Then compare their jobs against their projects, for the kind of work the resume is for. Whichever is the stronger evidence goes next. Someone whose jobs are in another field entirely — retail, admin, finance — and whose projects are substantial software should have PROJECTS ABOVE EXPERIENCE. Someone with real industry experience in the field should not.
   c. Skills last, unless the resume is very thin on everything else.

   Do not put skills or projects above education for someone still studying, and do not reorder simply to look different from the conventional layout.

   Names: "Projects" or "Technical Projects", "Experience" or "Work Experience", "Education". Pick what fits what is actually in the section.

3. CORRECTIONS. Misspellings, anywhere in what you were given — including inside the bullets.

   A correction is ONE WORD, or a short phrase that is a name. "recieve" -> "receive". "San Fransisco" -> "San Francisco". "Manger" -> "Manager". The word you give is replaced everywhere it appears, so give the word, not the sentence around it.

   You are proofreading, not editing. You cannot rewrite a bullet, reword it, shorten it, or improve it, and an attempt to do so through this field will be discarded. If a sentence is clumsy, that is not yours to fix.

   Leave alone, always:
   - technical terms, libraries, tools and product names — pytest, matplotlib, RevenueCat, PostgreSQL, MealApp, FraudWatch. A spellchecker flags all of these and every "fix" would be damage.
   - anything you are not confident is an error. Half the words on a resume are unusual on purpose.
   - numbers, dates, job titles, degrees, and people's names.
   - British or Canadian spellings when that is the person's convention. "organisation" is not a typo.

4. WARNINGS. Plain sentences addressed to the person, about what would weaken this resume in front of a recruiter: an entry with no bullets, no link to any work, a degree with no credential, a skill that shows up in their projects but is missing from their skills, dates that overlap in a way that looks like a mistake.

   One sentence each, at most two. Say the problem and what to do about it, then stop. Do not restate the dates back to them, do not reason out loud, and do not raise the same issue twice in different words. At most five warnings; if there are more, keep the five that would cost them the most.

   Never write a warning that ends in "no action needed" — if there is no action, it is not a warning. Never mention internal ids or field names.

Do not comment on the quality of their writing — you are not being asked to judge their bullets, and they have not asked.`;

const POLISH_TOOL: Anthropic.Tool = {
  name: 'submit_polish',
  description:
    'Submit the organisational decisions for this resume: how the skills group, what order the sections go in and what they are called, any clear factual corrections, and warnings for the person.',
  input_schema: {
    type: 'object',
    properties: {
      skillGroups: {
        type: 'array',
        description: 'The skills gathered into named groups, in the order they should appear.',
        items: {
          type: 'object',
          properties: {
            category: { type: 'string', description: 'The group name. Chosen to describe this person.' },
            items: {
              type: 'array',
              items: { type: 'string' },
              description: 'Skill terms, in the order they should appear. Every one must appear in the skills provided.',
            },
          },
          required: ['category', 'items'],
          additionalProperties: false,
        },
      },
      sections: {
        type: 'array',
        description:
          'Every section, in the order it should appear on the page. Include all four keys exactly once.',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', enum: ['education', 'experience', 'projects', 'skills'] },
            label: { type: 'string', description: 'What this section is called on the page.' },
          },
          required: ['key', 'label'],
          additionalProperties: false,
        },
      },
      corrections: {
        type: 'array',
        description: 'Clear factual errors in short fields. Empty when there are none — that is the normal case.',
        items: {
          type: 'object',
          properties: {
            from: { type: 'string', description: 'The exact current text, as given to you.' },
            to: { type: 'string', description: 'What it should say.' },
            reason: { type: 'string', description: 'One short sentence, addressed to the person.' },
          },
          required: ['from', 'to', 'reason'],
          additionalProperties: false,
        },
      },
      warnings: {
        type: 'array',
        items: { type: 'string' },
        description: 'Plain sentences addressed to the person about what would weaken this resume.',
      },
    },
    required: ['skillGroups', 'sections', 'corrections', 'warnings'],
    additionalProperties: false,
  },
};

export interface PolishResult {
  skillGroups: { category: string; items: string[] }[];
  sections: { key: SectionKey; label: string }[];
  corrections: { from: string; to: string; reason: string }[];
  warnings: string[];
}

export type SectionKey = 'education' | 'experience' | 'projects' | 'skills';

const SECTION_KEYS: SectionKey[] = ['education', 'experience', 'projects', 'skills'];

const DEFAULT_SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'education', label: 'Education' },
  { key: 'experience', label: 'Experience' },
  { key: 'projects', label: 'Projects' },
  { key: 'skills', label: 'Technical Skills' },
];

/** Loose comparison for checking a term against what was actually provided. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9+#]/g, '');
}

/**
 * Keeps only what the model was entitled to say.
 *
 * Every check here corresponds to a way the answer could be wrong in a way that
 * matters. A skill it invented would be a claim the person never made; a
 * dropped section would silently delete their education; a "correction" that
 * rewrites a field wholesale is an edit wearing a typo's clothes.
 */
export function validatePolish(raw: PolishResult, sourceSkills: string): PolishResult {
  const haystack = normalise(sourceSkills);

  const seen = new Set<string>();
  const skillGroups = raw.skillGroups
    .map((group) => ({
      category: group.category.trim() || 'Skills',
      items: (group.items ?? [])
        .map((item) => item.trim())
        .filter((item) => {
          if (!item) return false;
          // A term that appears nowhere in what they gave us is invented.
          if (!haystack.includes(normalise(item))) return false;
          // The same skill in two groups reads as padding.
          const key = normalise(item);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }),
    }))
    .filter((group) => group.items.length > 0);

  // Every section appears exactly once, whatever came back.
  const byKey = new Map<SectionKey, string>();
  for (const section of raw.sections ?? []) {
    if (SECTION_KEYS.includes(section.key) && !byKey.has(section.key)) {
      byKey.set(section.key, section.label.trim() || defaultLabel(section.key));
    }
  }
  const sections = [
    ...Array.from(byKey, ([key, label]) => ({ key, label })),
    ...DEFAULT_SECTIONS.filter((d) => !byKey.has(d.key)),
  ];

  // A correction is a word, not a sentence.
  //
  // These are replaced throughout the person's stored entries, bullets
  // included, so the bar is deliberately higher than "looks plausible". Too
  // short and a replacement lands inside unrelated words; too long and it stops
  // being a spelling fix and becomes an edit of what somebody wrote about their
  // own work, which is not what this pass is allowed to do.
  const corrections = (raw.corrections ?? []).filter((c) => {
    const from = c.from?.trim();
    const to = c.to?.trim();
    if (!from || !to || from === to) return false;
    if (from.length < 3 || from.length > 40) return false;
    // A word or a short name — never a clause.
    if (from.split(/\s+/).length > 4) return false;
    // Two edits for an ordinary word, because the commonest typo of all is a
    // pair of swapped letters and plain edit distance scores that as two, not
    // one. Three only for something long enough that two would be miserly.
    const allowed = from.length <= 4 ? 1 : from.length <= 12 ? 2 : 3;
    return editDistance(from.toLowerCase(), to.toLowerCase()) <= allowed;
  });

  return { skillGroups, sections, corrections, warnings: raw.warnings ?? [] };
}

function defaultLabel(key: SectionKey): string {
  return DEFAULT_SECTIONS.find((d) => d.key === key)!.label;
}

/** Levenshtein, used only to tell a typo fix from a rewrite. */
function editDistance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] =
        a[i - 1] === b[j - 1]
          ? rows[i - 1][j - 1]
          : 1 + Math.min(rows[i - 1][j], rows[i][j - 1], rows[i - 1][j - 1]);
    }
  }
  return rows[a.length][b.length];
}

/**
 * Applies the presentation decisions to the resume.
 *
 * Only presentation. Corrections are deliberately not applied here: a typo is
 * wrong in the person's data, not just in one rendering of it, so it is fixed
 * on the entry it came from and arrives here through the rebuild. Patching the
 * output instead left the entry still misspelled and the fix was lost the next
 * time anything was saved.
 *
 * Pure, so the interesting part is testable without a model. Bullets are copied
 * across untouched — there is nothing in `PolishResult` that could change one.
 */
export function applyPolish(structure: ResumeStructure, polish: PolishResult): ResumeStructure {
  return {
    ...structure,
    experience: structure.experience.map((x) => ({ ...x, bullets: x.bullets })),
    projects: structure.projects.map((p) => ({ ...p, bullets: p.bullets })),
    skills: polish.skillGroups.length
      ? polish.skillGroups.map((g) => ({ category: g.category, items: g.items.join(', ') }))
      : structure.skills,
    sections: polish.sections,
  };
}

/** One call. Cheap and short — this runs whenever a resume changes. */
export async function polishResume(
  userId: string,
  structure: ResumeStructure,
  locale: string | null,
): Promise<{ polish: PolishResult; applied: ResumeStructure }> {
  const sourceSkills = structure.skills.map((s) => `${s.category}: ${s.items}`).join('\n');

  const content = [
    {
      type: 'text' as const,
      text: [
        `Spelling convention: ${locale ?? 'en-CA'}.`,
        '',
        'Their skills, as they entered them:',
        sourceSkills || '(none listed)',
        '',
        'Their education:',
        structure.education.map((e) => `- ${e.degree} at ${e.school}, ${e.location}, ${e.dates}`).join('\n') || '(none)',
        '',
        'Their experience. Read the bullets for spelling only — you cannot rewrite them:',
        structure.experience
          .map((x) =>
            [`- ${x.title} at ${x.org}, ${x.location}, ${x.dates}`, ...x.bullets.map((b) => `    ${b}`)].join('\n'),
          )
          .join('\n') || '(none)',
        '',
        'Their projects:',
        structure.projects
          .map((p) =>
            [
              `- ${p.name} (${p.tech || 'no stack listed'}), ${p.dates}`,
              ...p.bullets.map((b) => `    ${b}`),
            ].join('\n'),
          )
          .join('\n') || '(none)',
        '',
        'Decide the skill groups, the section order and names, any clear corrections, and any warnings.',
      ].join('\n'),
    },
  ];

  const { toolInput } = await callClaude<PolishResult>({
    userId,
    kind: 'polish',
    system: POLISH_PROMPT,
    content,
    tool: POLISH_TOOL,
  });

  const polish = validatePolish(toolInput, sourceSkills);
  return { polish, applied: applyPolish(structure, polish) };
}
