/**
 * What a contact field has to look like before it goes on a resume.
 *
 * Deliberately narrow. A form that rejects somebody's real details is worse
 * than one that accepts a bad entry — the person cannot argue with it, and they
 * will either mangle a correct answer to get past it or leave it out. So each
 * rule below catches an unambiguous mistake and nothing else.
 */

export type ContactField = 'name' | 'email' | 'phone' | 'location' | 'linkedin' | 'github' | 'website';

/**
 * Whether something is a web address at all.
 *
 * Deliberately not asking which site it points at. A GitHub field that insists
 * on github.com rejects a self-hosted git server and a personal domain, and a
 * rejected real address is the tool being wrong about somebody — worse than a
 * link in the wrong box, which they can see and move.
 *
 * The protocol is checked rather than shrugged off. An earlier version stripped
 * any letters before "://", so "htt://www.linkedin.com/in/me" had its broken
 * protocol removed and the remainder sailed through as valid.
 */
export function isLink(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;

  const withoutProtocol = trimmed.replace(/^https?:\/\//i, '');
  // Anything still carrying a scheme separator has one we did not recognise.
  if (withoutProtocol.includes('://')) return false;

  const host = withoutProtocol.split(/[/?#]/)[0];
  // A name, at least one dot, and an ending that looks like a domain.
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(host);
}

/** Returns the problem, or null when there is not one. */
export function validateContactField(field: ContactField, raw: string): string | null {
  const value = raw.trim();

  switch (field) {
    case 'name':
      if (!value) return 'Your name goes at the top of every resume you make.';
      return null;

    case 'email':
      if (!value) return 'Without an email nobody can reply to you.';
      // Loose on purpose. The RFC-complete pattern is a page long, rejects
      // valid addresses, and still lets nonsense through; every serious form
      // checks the shape and lets a real message do the rest.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'That does not look like an email address.';
      return null;

    case 'phone': {
      if (!value) return 'Most applications ask for a phone number.';
      // Letters are the giveaway for a typo — "m9059225891" survived every
      // formatter because a formatter cannot tell a mistake from a convention
      // it does not recognise.
      if (/[a-z]/i.test(value)) return 'A phone number should not contain letters.';
      const digits = value.replace(/\D/g, '');
      if (digits.length < 7) return 'That looks too short for a phone number.';
      // E.164 caps a real number at fifteen digits.
      if (digits.length > 15) return 'That looks too long for a phone number.';
      return null;
    }

    // Every link field asks the same question, and none of them asks which site
    // it is. Putting a GitHub address in the LinkedIn box is a mistake somebody
    // can see on their own resume and move.
    case 'linkedin':
    case 'github':
    case 'website':
      if (!value) return null;
      if (!isLink(value)) return 'That does not look like a link.';
      return null;

    case 'location':
      // Unvalidated on purpose. "Toronto", "Toronto, ON", "Greater Toronto
      // Area" and "Remote" are all real answers, and no rule separates them
      // from a bad one without being wrong about somebody.
      return null;
  }
}

/** Every problem in the form, keyed by field. Empty when it is fit to save. */
export function validateContact(contact: Record<ContactField, string>): Partial<Record<ContactField, string>> {
  const problems: Partial<Record<ContactField, string>> = {};
  for (const field of Object.keys(contact) as ContactField[]) {
    const problem = validateContactField(field, contact[field] ?? '');
    if (problem) problems[field] = problem;
  }
  return problems;
}
