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

// Tracks the Source Resume upload for the panel's own UI (name, timestamp,
// loaded/warning state). The uploaded bytes are NOT retained here — the file is
// sent once for extraction and only the resulting Resume Structure is kept
// (resumi-source-structure).
export interface BaseResumeState {
  loaded: boolean;
  fileName: string;
  updatedAt: string;
  warning: string | null;
}

export const emptyBaseResume: BaseResumeState = {
  loaded: false,
  fileName: '',
  updatedAt: '',
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
  status: 'pending';
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  // Cached tokens are billed separately and are not counted in inputTokens.
  // Optional because sessions persisted before caching was added won't have them.
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
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
  warnings: string[];
  // True for the entire span of a tailor request (first-time or re-tailor).
  // Drives the tab-title reset and the mid-tailoring recovery banner — if
  // this is still true on a fresh page load, the previous attempt never
  // got to clear it, which only happens if the tab/browser closed mid-request.
  tailoring: boolean;
  // True only during a background re-tailor — kept for RecoveryBanner compatibility.
  updating: boolean;
  // Increments each time a new tailored Resume Structure is generated (initial
  // tailor resets to 1; each re-tailor or instruction update increments by 1).
  // Drives the Version N badge and "Generated X ago" label on the download
  // section.
  resumeVersion: number;
  resumeGeneratedAt: string;
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
  warnings: [],
  tailoring: false,
  updating: false,
  resumeVersion: 0,
  resumeGeneratedAt: '',
};

export type ApiErrorType = 'network' | 'auth' | 'generic' | 'timeout';

export interface ApiErrorPayload {
  type: ApiErrorType;
  message: string;
}

export interface ResumeStructure {
  name: string;
  contact: { phone?: string; email?: string; linkedin?: string; github?: string; website?: string };
  summary?: string;
  education: { school: string; location: string; degree: string; dates: string }[];
  experience: { title: string; dates: string; org: string; location: string; bullets: string[] }[];
  projects: { name: string; tech: string; dates: string; bullets: string[] }[];
  skills: { category: string; items: string }[];
  certifications?: string[];
  awards?: string[];
}
