export interface DocumentFileState {
  loaded: boolean;
  fileName: string;
  updatedAt: string;
  base64: string;
  mimeType: string;
}

export const emptyDocumentFile: DocumentFileState = {
  loaded: false,
  fileName: '',
  updatedAt: '',
  base64: '',
  mimeType: '',
};

export interface BaseResumeState {
  loaded: boolean;
  fileName: string;
  updatedAt: string;
  base64: string;
  warning: string | null;
}

export const emptyBaseResume: BaseResumeState = {
  loaded: false,
  fileName: '',
  updatedAt: '',
  base64: '',
  warning: null,
};

export interface JobPostingImage {
  id: string;
  fileName: string;
  base64: string;
  mimeType: string;
}

export interface JobPostingState {
  company: string;
  role: string;
  description: string;
  images: JobPostingImage[];
  companyAutoDetected: boolean;
  roleAutoDetected: boolean;
  extracted: boolean;
  needsReExtraction: boolean;
  loaded: boolean;
  updatedAt: string;
}

export const emptyJobPosting: JobPostingState = {
  company: '',
  role: '',
  description: '',
  images: [],
  companyAutoDetected: false,
  roleAutoDetected: false,
  extracted: false,
  needsReExtraction: false,
  loaded: false,
  updatedAt: '',
};

export interface StructuralChange {
  id: string;
  description: string;
  reason: string;
  status: 'pending' | 'approved' | 'reverted';
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface SessionState {
  complete: boolean;
  company: string;
  role: string;
  jobDescription: string;
  matchScore: number | null;
  missingRequirements: string[];
  estimatedPages: number | null;
  vague: boolean;
  vagueReason: string;
  vagueAcknowledged: boolean;
  log: string[];
  structuralChanges: StructuralChange[];
  usage: TokenUsage | null;
  safeDocxBase64: string | null;
  warnings: string[];
  // True for the entire span of a tailor request (first-time or re-tailor).
  // Drives the tab-title reset and the mid-tailoring recovery banner — if
  // this is still true on a fresh page load, the previous attempt never
  // got to clear it, which only happens if the tab/browser closed mid-request.
  tailoring: boolean;
  // True only for a background re-tailor kicked off from a completed
  // session — shows the "Updating with new session..." overlay on Review.
  updating: boolean;
  backgroundError: ApiErrorPayload | null;
  // Increments each time a new .docx is generated (initial tailor resets to 1;
  // each re-tailor or instruction update increments by 1). Drives the Version N
  // badge and "Generated X ago" label on the download section.
  docxVersion: number;
  docxGeneratedAt: string;
}

export const emptySession: SessionState = {
  complete: false,
  company: '',
  role: '',
  jobDescription: '',
  matchScore: null,
  missingRequirements: [],
  estimatedPages: null,
  vague: false,
  vagueReason: '',
  vagueAcknowledged: false,
  log: [],
  structuralChanges: [],
  usage: null,
  safeDocxBase64: null,
  warnings: [],
  tailoring: false,
  updating: false,
  backgroundError: null,
  docxVersion: 0,
  docxGeneratedAt: '',
};

export type ApiErrorType = 'network' | 'auth' | 'generic' | 'timeout';

export interface DebugInfo {
  sentAt: string;
  aboutMePresent: boolean;
  aboutMeSizeKb: number;
  rulesPresent: boolean;
  rulesSizeKb: number;
  jobCompany: string;
  jobRole: string;
  jobDescriptionChars: number;
  jobDescriptionPreview: string;
  jobImageCount: number;
  paragraphCount: number;
  editableParagraphCount: number;
  paragraphsPreview: string;
  claudeParagraphsReturned: number;
  claudeChangedCount: number;
  claudeChangedIndices: number[];
  claudeLogPreview: string;
  claudeMatchScore: number | null;
  claudeVague: boolean;
}

export interface ApiErrorPayload {
  type: ApiErrorType;
  message: string;
}
