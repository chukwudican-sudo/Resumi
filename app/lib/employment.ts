/**
 * Employment type, and where it belongs.
 *
 * A resume writes it in brackets after the job title — "Operations & Client
 * Engagement (Full-Time)" — because there is nowhere else for it to go on a
 * page. In the app there is somewhere else: the chip on the entry. So the chip
 * is the source of truth and the title is just the title, which means a job
 * type typed into the title has to be lifted out of it.
 *
 * Deterministic on purpose. This is a match against a fixed list, so it should
 * cost nothing, run instantly, and never be subject to a model's reading of
 * what a bracket meant.
 */

/** The forms people actually write, mapped to what they mean. */
const TYPES: Record<string, string> = {
  'full-time': 'Full-time', 'full time': 'Full-time', fulltime: 'Full-time',
  'part-time': 'Part-time', 'part time': 'Part-time', parttime: 'Part-time',
  internship: 'Internship', intern: 'Internship',
  'co-op': 'Co-op', coop: 'Co-op', 'co op': 'Co-op',
  contract: 'Contract', contractor: 'Contract', freelance: 'Freelance',
  temporary: 'Temporary', temp: 'Temporary', casual: 'Casual',
  volunteer: 'Volunteer', voluntary: 'Volunteer',
  seasonal: 'Seasonal', apprenticeship: 'Apprenticeship',
};

/**
 * Printed on the resume, or not.
 *
 * Full-time is what a reader already assumes, so saying it on every role says
 * nothing and makes the page look generated. The types worth printing are the
 * ones that explain something — why two roles overlap, why a stint was short.
 */
export function shouldPrint(employment: string | null | undefined): boolean {
  const known = TYPES[(employment ?? '').trim().toLowerCase()];
  return Boolean(known) && known !== 'Full-time';
}

/** The job title as it should appear, with the type appended when it earns it. */
export function titleWithEmployment(title: string, employment: string | null | undefined): string {
  const clean = title.trim();
  if (!shouldPrint(employment)) return clean;
  const label = TYPES[(employment ?? '').trim().toLowerCase()];
  // Already said, so not said twice.
  if (new RegExp(`\\(\\s*${label}\\s*\\)`, 'i').test(clean)) return clean;
  return `${clean} (${label})`;
}

/**
 * Lifts a job type out of a title.
 *
 * Only a recognised type is taken. "Wealth Manager (Client Services & Financial
 * Planning)" is a description of the role, not its employment basis, and
 * stripping it would delete something the person meant to say.
 */
export function splitEmployment(title: string): { title: string; employment: string | null } {
  let employment: string | null = null;

  const stripped = title.replace(/\(([^()]{1,30})\)/g, (whole, inner: string) => {
    const known = TYPES[inner.trim().toLowerCase()];
    if (!known) return whole;
    employment = known;
    return '';
  });

  return { title: stripped.replace(/\s{2,}/g, ' ').trim(), employment };
}
