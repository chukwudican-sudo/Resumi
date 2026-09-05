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
 * skills, an ordering of sections, and warnings.
 * The app applies those to the structure itself. So the failure mode of a bad
 * response is a poor grouping, not a sentence you never wrote appearing under
 * your name.
 *
 * Rewriting bullets is a different job, it requires a job posting to rewrite
 * *toward*, and it lives in the tailor path.
 */

export const POLISH_PROMPT = `You are preparing someone's master resume for presentation. They typed their history into a form; you decide how it reads.

You are NOT rewriting their content. You never see their bullets come back to you, and you must not attempt to restate, summarise or improve them. Your job is organisation only — the spelling is proofread separately and is not your concern.

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

3. WARNINGS. Plain sentences addressed to the person, about what would weaken this resume in front of a recruiter: an entry with no bullets, no link to any work, a degree with no credential, a skill that shows up in their projects but is missing from their skills, dates that overlap in a way that looks like a mistake.

   Overlapping dates are worked out for you and stated below. Say nothing about an overlap unless you are told it is unexplained.

   One sentence each, at most two. Say the problem and what to do about it, then stop. Do not restate the dates back to them, do not reason out loud, and do not raise the same issue twice in different words. At most five warnings; if there are more, keep the five that would cost them the most.

   Never write a warning that ends in "no action needed" — if there is no action, it is not a warning. Never mention internal ids or field names.

Do not comment on the quality of their writing — you are not being asked to judge their bullets, and they have not asked.`;

const POLISH_TOOL: Anthropic.Tool = {
  name: 'submit_polish',
  description:
    'Submit the organisational decisions for this resume: how the skills group, what order the sections go in and what they are called, and warnings for the person.',
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
      warnings: {
        type: 'array',
        items: { type: 'string' },
        description: 'Plain sentences addressed to the person about what would weaken this resume.',
      },
    },
    required: ['skillGroups', 'sections', 'warnings'],
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

/**
 * Whatever came back, as a list.
 *
 * A tool schema describes what a model should return, not what it will. Ask for
 * an array of warnings and get one warning as a bare string, and every `.map`,
 * `.filter` and `for...of` downstream throws — three of them here on the
 * server, one of them in React, in front of somebody who was only adding
 * skills. Unusual input makes the drift likelier, which means it happens on
 * exactly the profiles least able to afford it.
 */
function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return [];
}

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
/**
 * Keeps only what is a spelling fix.
 *
 * These are replaced throughout the person's stored entries, bullets included,
 * so the bar is deliberately higher than "looks plausible". Too short and a
 * replacement lands inside unrelated words; too long and it stops being a
 * spelling fix and becomes an edit of what somebody wrote about their own work,
 * which is not what any of this is allowed to do.
 */
export function validateCorrections(raw: unknown): PolishResult['corrections'] {
  return asList<PolishResult['corrections'][number]>(raw).filter((c) => {
    if (!c || typeof c.from !== 'string' || typeof c.to !== 'string') return false;
    const from = c.from.trim();
    const to = c.to.trim();
    if (!from || !to || from === to) return false;
    if (from.length < 3 || from.length > 40) return false;
    // A word or a short name — never a clause.
    if (from.split(/\s+/).length > 4) return false;
    // Compared on letters alone. "Dean Listst" -> "Dean's List" is one missing
    // letter and a misplaced apostrophe, but counted character by character it
    // scores four edits, because the apostrophe shifts everything after it —
    // and the rule rejected the correction as too large to be a typo. Spacing
    // and punctuation are not spelling.
    const letters = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
    const a = letters(from);
    const b = letters(to);
    if (!a || !b) return false;

    // Scaled rather than stepped. A fixed allowance of two is right for one
    // word and wrong for two: "Dean Listst" -> "Dean's List" is three edits on
    // the letters and unmistakably a typo. What actually separates a fix from a
    // rewrite is proportion — a third of a short phrase can change and it is
    // still the same phrase; "Operations Specialist" into "Senior Operations
    // Manager" is nowhere near that, whatever its length.
    const allowed = Math.min(5, Math.max(1, Math.ceil(a.length * 0.35)));
    return editDistance(a, b) <= allowed;
  });
}

export function validatePolish(raw: PolishResult, sourceSkills: string): PolishResult {
  const haystack = normalise(sourceSkills);

  const seen = new Set<string>();
  const skillGroups = asList<PolishResult['skillGroups'][number]>(raw.skillGroups)
    .filter((group) => group && typeof group.category === 'string')
    .map((group) => ({
      category: group.category.trim() || 'Skills',
      items: asList<string>(group.items)
        .filter((item): item is string => typeof item === 'string')
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
  for (const section of asList<PolishResult['sections'][number]>(raw.sections)) {
    if (section && SECTION_KEYS.includes(section.key) && !byKey.has(section.key)) {
      byKey.set(section.key, section.label.trim() || defaultLabel(section.key));
    }
  }
  const sections = [
    ...Array.from(byKey, ([key, label]) => ({ key, label })),
    ...DEFAULT_SECTIONS.filter((d) => !byKey.has(d.key)),
  ];

  const corrections = validateCorrections(raw.corrections);

  return {
    skillGroups,
    sections,
    corrections,
    warnings: asList<string>(raw.warnings).filter((w): w is string => typeof w === 'string' && w.trim() !== ''),
  };
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

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

/**
 * A rendered date range back into months, for arithmetic.
 *
 * Safe to parse because we generated it: `formatDates` produces "May 2025 –
 * Aug 2026", "Nov 2025 – Present", "2024", and nothing else.
 */
function monthRange(dates: string): { from: number; to: number } | null {
  const point = (text: string): number | null => {
    if (/present|current/i.test(text)) return 9999 * 12;
    const match = /(?:([A-Za-z]{3})[a-z]*\s+)?(\d{4})/.exec(text);
    if (!match) return null;
    const month = match[1] ? MONTHS.indexOf(match[1].toLowerCase()) : 0;
    return Number(match[2]) * 12 + (month < 0 ? 0 : month);
  };

  const [rawFrom, rawTo] = dates.split(/[–—-]/);
  const from = point(rawFrom ?? '');
  if (from === null) return null;
  const to = rawTo ? point(rawTo) : from;
  return { from, to: to ?? from };
}

/**
 * What to tell the model about concurrent roles.
 *
 * Worked out here rather than left to the model. Told to weigh it itself, it
 * read a title ending in "(Part-time)" and still advised marking one of the
 * roles part-time; given a list of full-time roles without the arithmetic done,
 * it reported an overlap between two that do not overlap at all. Both failures
 * are the same failure — this is date comparison, and a date comparison should
 * not be a judgement call.
 *
 * Holding two jobs at once is ordinary. It is worth raising only when nothing
 * on the page accounts for it: two roles that both read as full-time, running
 * at the same time.
 */
export function overlapNote(structure: ResumeStructure): string {
  const roles = structure.experience
    // A job type is printed in the title only when it is not full-time, so a
    // title with no bracketed type is a role that reads as full-time.
    .filter(
      (x) =>
        !/\((part-time|internship|co-op|contract|freelance|temporary|casual|volunteer|seasonal|apprenticeship)\)/i.test(
          x.title,
        ),
    )
    .map((x) => ({ label: `${x.title} at ${x.org} (${x.dates})`, span: monthRange(x.dates) }))
    .filter((r): r is { label: string; span: { from: number; to: number } } => r.span !== null);

  const clashes: string[] = [];
  for (let i = 0; i < roles.length; i += 1) {
    for (let j = i + 1; j < roles.length; j += 1) {
      const a = roles[i].span;
      const b = roles[j].span;
      if (a.from < b.to && b.from < a.to) clashes.push(`  - ${roles[i].label} and ${roles[j].label}`);
    }
  }

  if (!clashes.length) {
    return 'Overlapping dates: none that need raising. Do not mention overlaps, concurrency, or job types in your warnings.';
  }

  return [
    'Overlapping dates: these pairs both read as full-time and genuinely run at the same time. Raise this once:',
    ...clashes,
  ].join('\n');
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
        'Their education, field by field:',
        structure.education
          .map((e) =>
            [
              `- School: ${e.school}`,
              `  Degree: ${e.degree}`,
              `  Where: ${e.location}`,
              `  When: ${e.dates}`,
              ...(e.bullets ?? []).map((b) => `  Also: ${b}`),
            ].join('\n'),
          )
          .join('\n') || '(none)',
        '',
        `Today is ${new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long' })}. Nothing dated before that is in the future.`,
        '',
        overlapNote(structure),
        '',
        'Their experience. The bullets are here for context; they are not yours to change.',
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
        'Group and name the skills, decide the section order and names, and write the warnings.',
        'Spelling is somebody else\'s job — do not comment on it.',
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
