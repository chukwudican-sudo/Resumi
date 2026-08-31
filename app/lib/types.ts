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

// ── Onboarding ─────────────────────────────────────────────────────────────

/**
 * What we ask before getting out of the way.
 *
 * Deliberately two fields. Asking more up front is what drives people off, and
 * everything else about them is collected later by the thing that is already
 * good at it — the questions, or their uploaded resume.
 */
export type CareerStage = 'internship' | 'new_grad' | 'experienced';

export interface OnboardingState {
  completed: boolean;
  stage: CareerStage | '';
  /** Free text: "backend", "data science", "product design". Optional. */
  targetField: string;
  completedAt: string;
}

export const emptyOnboarding: OnboardingState = {
  completed: false,
  stage: '',
  targetField: '',
  completedAt: '',
};

export const CAREER_STAGE_LABELS: Record<CareerStage, string> = {
  internship: 'Looking for an internship',
  new_grad: 'New grad / early career',
  experienced: 'Experienced hire',
};

// ── Interview model ────────────────────────────────────────────────────────
// The interview collects atomic facts rather than finished bullets. Bullets are
// composed from facts at the end, which is what lets the question generator see
// that an entry is missing a number or a team size and ask about exactly that.
//
// These are shaped as rows on purpose: the persistence swap in a later
// milestone should move them to Postgres without redesigning them.

export type FactCategory =
  | 'action'      // what they did
  | 'metric'      // a number that shows size or change
  | 'scope'       // team size, users served, budget, surface owned
  | 'tooling'     // languages, frameworks, services
  | 'outcome'     // what changed as a result
  | 'context'     // constraints, why it mattered
  | 'skill'       // a capability, not tied to one entry
  | 'credential'  // degree, certification, award
  | 'preference'  // how they want the resume written
  | 'identity';   // name, contact, location

export type FactSource = 'interview' | 'resume_import' | 'linkedin' | 'github' | 'manual';

export type EntryKind = 'experience' | 'project' | 'education';

export interface ProfileEntry {
  id: string;
  kind: EntryKind;
  title?: string;
  org?: string;
  location?: string;
  datesDisplay?: string;
  /** 0 is most recent. Drives both resume order and question priority. */
  orderIndex: number;
  source: FactSource;
}

export interface Fact {
  id: string;
  /** null for facts that belong to the person rather than one entry. */
  entryId: string | null;
  category: FactCategory;
  text: string;
  /** Whether the text carries a real quantity. A metric fact without one does not close a metric gap. */
  hasNumber: boolean;
  confidence: number;
  source: FactSource;
  sourceTurnId: string | null;
  status: 'active' | 'archived' | 'superseded';
}

export type InterviewPhase = 'identity' | 'breadth' | 'depth' | 'skills';

export interface InterviewQuestion {
  text: string;
  /** Shown to the user so the interview explains itself. */
  why: string;
  targets: { entryId: string | null; category: FactCategory };
  kind: 'open' | 'numeric' | 'choice';
  choices?: string[];
  skippable: boolean;
}

export interface InterviewTurn {
  id: string;
  idx: number;
  question: InterviewQuestion;
  rawAnswer: string;
  skipped: boolean;
}

export interface InterviewSession {
  id: string;
  status: 'active' | 'paused' | 'completed' | 'abandoned';
  phase: InterviewPhase;
  turns: InterviewTurn[];
  pendingQuestion: InterviewQuestion | null;
  startedAt: string;
  completedAt: string | null;
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
