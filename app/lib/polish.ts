import Anthropic from '@anthropic-ai/sdk';
import { callClaude } from './anthropic';
import type { ResumeSection, ResumeStructure } from './types';
import { CONVENTIONAL_ORDER, STORED_ELSEWHERE, contentFor, hasContent, planSections } from './sections';

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

2. SECTION ORDER AND NAMES. You are given this person's sections, by key, with what each is currently called. Return EVERY key you were given, exactly once, in the order they should appear — and no key you were not given. You are deciding order and names. You are not deciding which sections exist; that is theirs, not yours.

   Work it out in this order, and follow it:
   a. Is there a degree in progress, or one finished within roughly the last year? If so, EDUCATION GOES FIRST. A student is read as a student, and burying the degree makes a reader hunt for the thing that explains the rest of the page. Only someone several years past graduating puts education below their work.
   b. Then compare their jobs against their projects, for the kind of work the resume is for. Whichever is the stronger evidence goes next. Someone whose jobs are in another field entirely — retail, admin, finance — and whose projects are substantial software should have PROJECTS ABOVE EXPERIENCE. Someone with real industry experience in the field should not.
   c. Skills last, unless the resume is very thin on everything else.
   d. A section you were given that is not one of those four — a summary, volunteering, publications, activities — goes where it reads best for this person. A summary belongs at the top if it is there at all. Supporting sections go below the main evidence.

   Do not put skills or projects above education for someone still studying, and do not reorder simply to look different from the conventional layout.

   Names: "Projects" or "Technical Projects", "Experience" or "Work Experience", "Education". Pick what fits what is actually in the section. A section they named themselves keeps that name unless it is plainly a mistake — "Extracurricular & Community Activities" is what they call it, and shortening it to "Activities" is your preference, not an improvement.

3. WARNINGS. Plain sentences addressed to the person, about what would weaken this resume in front of a recruiter: an entry with no bullets, no link to any work, a degree with no credential, a skill that shows up in their projects but is missing from their skills, dates that overlap in a way that looks like a mistake, an award or certificate with no issuer or no date, a certificate that has expired.

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
          'Every section, in the order it should appear on the page. Use the keys listed in the message, each exactly once, and no others.',
        items: {
          type: 'object',
          properties: {
            // No enum. It used to name the same four keys forever, which meant
            // a section this person actually has — Volunteering, a Summary —
            // could not be returned, and validatePolish then deleted it for
            // being absent. The keys are given in the message instead, and
            // anything not on that list is dropped below.
            key: { type: 'string', description: 'The section key, exactly as given in the message.' },
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
  sections: { key: string; label: string }[];
  corrections: { from: string; to: string; reason: string }[];
  warnings: string[];
}

/**
 * The four printed sections everybody has, for a profile that has never said
 * otherwise. Derived rather than retyped — this list and the renderer's
 * fallback drifting apart is how a section ends up in one and not the other.
 */
const DEFAULT_SECTIONS = CONVENTIONAL_ORDER.filter((s) => !s.optional).map((s) => ({
  key: s.key,
  label: s.label,
}));

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

/**
 * The individual skill terms inside the block handed to the model.
 *
 * Same shape the skills form and the material list use — "Category: a, b, c"
 * per line — so what counts as one skill is decided in the same way everywhere.
 */
function splitSkillTerms(sourceSkills: string): string[] {
  return sourceSkills
    .split('\n')
    .flatMap((line) => {
      const colon = line.indexOf(':');
      return (colon > 0 ? line.slice(colon + 1) : line).split(',');
    })
    .map((term) => term.trim())
    .filter(Boolean);
}

/**
 * One correction rule, applied to a string.
 *
 * Whole-word, so "SQL" in a correction never rewrites the middle of
 * "PostgreSQL". The database path (applyCorrectionsToEntries and its skill
 * sibling) builds the same expression against rows; this is for text already in
 * hand — the skill groups on their way to being saved, which are read from the
 * profile before the corrections land and would otherwise carry the typo back.
 */
export function correctText(text: string, corrections: { from: string; to: string }[]): string {
  return corrections.reduce(
    (acc, c) =>
      acc.replace(new RegExp(`\\b${c.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), c.to),
    text,
  );
}

/**
 * @param known The sections this person actually has, in their current order.
 * Both the whitelist and the fallback: a key the model returns that is not in
 * here was invented, and a key in here the model did not return was forgotten,
 * and neither may change what sections exist.
 *
 * This parameter is the fix for a section-deleting bug. `known` used to be a
 * hardcoded list of four, so a Volunteering section survived the upload, sat in
 * the database, and was deleted by the polish that runs before every tailor —
 * the feature appearing to work right up until the first time it mattered.
 */
export function validatePolish(
  raw: PolishResult,
  sourceSkills: string,
  known: { key: string; label: string }[] = DEFAULT_SECTIONS,
): PolishResult {
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

  // Nothing the person listed may disappear.
  //
  // The filter above stops the model inventing a skill, which is the dangerous
  // direction — but there was no guard the other way, and it does forget. A
  // real resume came back with "Ms PowerPoint" in the profile and absent from
  // the document, which nobody would catch without comparing the two side by
  // side. Losing a skill somebody claims is quieter than adding one and just as
  // wrong.
  //
  // Only recovers things that already look like terms. Half the reason this
  // pass exists is that people write prose in the skills box — "Uses Python for
  // backend algorithm work" — and echoing that onto a resume would be worse
  // than dropping it. So a candidate has to be short enough to be a term, and
  // must not merely be a sentence mentioning one that was already extracted.
  //
  // Recovered into the last group rather than a heading of its own: the
  // placement is a guess, but an approximately grouped skill still on the
  // resume beats a correctly grouped one that is gone.
  if (skillGroups.length) {
    const emitted = Array.from(seen);
    const missing = splitSkillTerms(sourceSkills).filter((term) => {
      const key = normalise(term);
      if (!key || seen.has(key)) return false;
      // Prose, not a term.
      if (term.split(/\s+/).length > 3 || term.length > 32) return false;
      // A phrase wrapped around a skill already taken out of it.
      if (emitted.some((e) => key.includes(e))) return false;
      seen.add(key);
      return true;
    });

    const last = skillGroups[skillGroups.length - 1];
    last.items.push(...missing);
  }

  // Every section appears exactly once, whatever came back. Ordering is the
  // model's to decide; existence is not.
  const allowed = new Map(known.map((k) => [k.key, k.label]));
  const byKey = new Map<string, string>();
  for (const section of asList<PolishResult['sections'][number]>(raw.sections)) {
    if (!section || typeof section.key !== 'string') continue;
    if (!allowed.has(section.key) || byKey.has(section.key)) continue;
    byKey.set(section.key, (section.label ?? '').trim() || allowed.get(section.key)!);
  }
  const sections = [
    ...Array.from(byKey, ([key, label]) => ({ key, label })),
    ...known.filter((k) => !byKey.has(k.key)),
  ];

  const corrections = validateCorrections(raw.corrections);

  return {
    skillGroups,
    sections,
    corrections,
    warnings: asList<string>(raw.warnings).filter((w): w is string => typeof w === 'string' && w.trim() !== ''),
  };
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
  // Order and labels from the pass; shape and content from what was already
  // there. Assigning polish.sections wholesale would be right for the four the
  // app has always had and wrong for every other one: the pass returns a key
  // and a label, so a custom section would come back stripped of the shape that
  // says how to draw it and the content that is the section — deleted, in
  // effect, by the thing that was only asked to order it.
  const stored = new Map((structure.sections ?? []).map((s) => [s.key, s]));
  const sections: ResumeSection[] = polish.sections.map((s) => ({
    ...(stored.get(s.key) ?? {}),
    key: s.key,
    label: s.label,
  }));

  return {
    ...structure,
    experience: structure.experience.map((x) => ({ ...x, bullets: x.bullets })),
    projects: structure.projects.map((p) => ({ ...p, bullets: p.bullets })),
    skills: polish.skillGroups.length
      ? polish.skillGroups.map((g) => ({ category: g.category, items: g.items.join(', ') }))
      : structure.skills,
    sections,
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

/**
 * The sections the four blocks below do not spell out, as text.
 *
 * The pass was handed skills, education, experience and projects, and then a
 * bare list of section keys — so it was asked to decide where "Awards & Honors"
 * belongs on the page while having never seen a single award. It could not
 * judge whether they were strong, and it could not raise one that was missing
 * an issuer, because rule 3 asks for warnings about a resume it was shown half
 * of.
 *
 * Content only, and stated as not-yours-to-change: this pass returns an
 * ordering and a grouping, never prose. What it reads it cannot rewrite.
 */
export function otherSections(structure: ResumeStructure): string {
  const blocks: string[] = [];

  for (const section of planSections(structure)) {
    if (STORED_ELSEWHERE.has(section.key)) continue;
    const content = contentFor(structure, section);
    if (!hasContent(content)) continue;

    const lines: string[] = [`${section.label} (key: ${section.key}):`];
    switch (content.shape) {
      case 'entries':
        for (const e of content.entries) {
          lines.push(`- ${[e.heading, e.sub, e.headingRight, e.subRight].filter(Boolean).join(', ')}`);
          lines.push(...e.bullets.map((b) => `    ${b}`));
        }
        break;
      case 'inline':
        for (const e of content.entries) {
          lines.push(`- ${[e.name, e.tech, e.dates].filter(Boolean).join(', ')}`);
          lines.push(...e.bullets.map((b) => `    ${b}`));
        }
        break;
      case 'groups':
        for (const g of content.groups) lines.push(`- ${g.items ? `${g.category}: ${g.items}` : g.category}`);
        break;
      case 'list':
        for (const item of content.items) lines.push(`- ${item}`);
        break;
      case 'prose':
        lines.push(content.text);
        break;
    }
    blocks.push(lines.join('\n'));
  }

  return blocks.length ? blocks.join('\n\n') : '(none)';
}

/** One call. Cheap and short — this runs whenever a resume changes. */
export async function polishResume(
  userId: string,
  structure: ResumeStructure,
  locale: string | null,
): Promise<{ polish: PolishResult; applied: ResumeStructure }> {
  const sourceSkills = structure.skills.map((s) => `${s.category}: ${s.items}`).join('\n');

  // The sections this person actually has — the whole list the pass may order,
  // and nothing outside it. Built from the structure rather than from a
  // constant, so a Summary or a Volunteering section is orderable like any
  // other instead of being invisible to the pass and deleted by its validator.
  //
  // Read through planSections rather than off structure.sections directly. A
  // profile that predates the sections table has a summary and no plan naming
  // it, and taking the plan literally would leave the summary out of `known` —
  // so the pass could not return it, the validator would not restore it, and
  // this call would be the one that deleted it. planSections answers the
  // question actually being asked: what is on this page.
  const present = planSections(structure)
    .filter((s) => hasContent(contentFor(structure, s)))
    .map((s) => ({ key: s.key, label: s.label }));
  const known = present.length ? present : DEFAULT_SECTIONS;

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
        'Their other sections \u2014 a summary, certifications, awards, anything their resume has. The content is here so you can judge where each belongs and what is weak about it; it is not yours to change:',
        otherSections(structure),
        '',
        'Their sections, in the order they currently print. Return every one of these keys exactly once and no others — you are deciding the order and the names, not which sections exist:',
        known.map((k) => `- ${k.key} (currently "${k.label}")`).join('\n'),
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

  const polish = validatePolish(toolInput, sourceSkills, known);
  return { polish, applied: applyPolish(structure, polish) };
}
