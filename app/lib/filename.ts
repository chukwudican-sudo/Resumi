// Universal PDF filename rule (Resumi change-spec, Section 11):
//   FirstName_LastName_RoleTitle_Company_Resume.pdf
// No spaces, no special characters, no dates/version numbers, max 50 chars
// before ".pdf" (truncate the role title first if it doesn't fit).

const SPECIAL_CHARS_REGEX = /[@#%&*()/\\|?!'",.]/g;
export const FILENAME_MAX_BASE_LENGTH = 50;

function titleCaseConcat(value: string): string {
  return value
    .replace(SPECIAL_CHARS_REGEX, '')
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

function sanitizeNamePart(name: string): string {
  const cleaned = name.replace(SPECIAL_CHARS_REGEX, '').trim();
  if (!cleaned) return 'Applicant';
  return cleaned.split(/\s+/).filter(Boolean).join('_');
}

/** Builds the default filename base (everything before ".pdf"). */
export function buildDefaultFilenameBase(userName: string, role: string, company: string): string {
  const namePart = sanitizeNamePart(userName);
  const rolePart = titleCaseConcat(role);
  const companyPart = titleCaseConcat(company);

  const fullSegments = [namePart, rolePart, companyPart, 'Resume'].filter(Boolean);
  let base = fullSegments.join('_');

  if (base.length > FILENAME_MAX_BASE_LENGTH && rolePart) {
    const overage = base.length - FILENAME_MAX_BASE_LENGTH;
    const truncatedRole = rolePart.slice(0, Math.max(1, rolePart.length - overage));
    const truncatedSegments = [namePart, truncatedRole, companyPart, 'Resume'].filter(Boolean);
    base = truncatedSegments.join('_');
  }

  return base.slice(0, FILENAME_MAX_BASE_LENGTH);
}

/** Live-sanitizes user input in the editable filename field (base name only, no ".pdf"). */
export function sanitizeFilenameInput(value: string): string {
  return value
    .replace(SPECIAL_CHARS_REGEX, '')
    .replace(/\s+/g, '_')
    .slice(0, FILENAME_MAX_BASE_LENGTH);
}
