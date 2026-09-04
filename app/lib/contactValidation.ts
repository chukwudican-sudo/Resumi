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
 * The host part of whatever somebody pasted.
 *
 * People paste all of "github.com/me", "https://github.com/me" and
 * "https://www.github.com/me/". Matching the raw string means writing a pattern
 * that copes with each, and the first version of this quietly failed on the
 * protocol form — it looked for github at the start or after a dot, and in
 * "https://github.com" it is after a slash.
 */
function host(value: string): string {
  return value
    .trim()
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/^www\./i, '')
    .split(/[/?#]/)[0]
    .toLowerCase();
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

    case 'linkedin':
      if (!value) return null;
      if (host(value) !== 'linkedin.com') return 'Paste the address of your LinkedIn profile.';
      return null;

    case 'github':
      if (!value) return null;
      // github.io covers someone linking their pages site instead.
      if (!/^github\.(com|io)$/.test(host(value)) && !host(value).endsWith('.github.io')) {
        return 'Paste the address of your GitHub profile.';
      }
      return null;

    case 'website':
      if (!value) return null;
      if (!/^[^\s.]+(\.[^\s.]+)+/.test(value.replace(/^https?:\/\//i, ''))) {
        return 'That does not look like a web address.';
      }
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
