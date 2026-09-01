import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * The database, as the designs require it.
 *
 * Two things shape this schema more than anything else:
 *
 * A job search is 30-50 applications, not one. So an application is a
 * first-class row with a status and its own history, and the profile is the
 * reusable thing behind all of them.
 *
 * Nothing on a resume may be unsupported. Facts are stored atomically in the
 * person's own words and bullets cite the facts they came from, so an
 * unsupported line is detectable rather than merely unlikely.
 */

const id = () => text('id').primaryKey();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

// ── Account ────────────────────────────────────────────────────────────────

/**
 * Mirrors the Clerk user. `id` is Clerk's `sub` (`user_2ab…`), which is text
 * and NOT a uuid — Supabase's `auth.uid()` returns null for it, so any RLS
 * policy must compare against the raw `sub` claim instead. Keeping this column
 * text is what makes that possible later.
 */
export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  /** Drives spelling in generated resumes. A US applicant should not get "organise". */
  locale: text('locale').notNull().default('en-CA'),
  /** From onboarding: internship | new_grad | experienced. */
  stage: text('stage'),
  targetField: text('target_field'),

  plan: text('plan').notNull().default('free'),
  /** One credit is one generation. An entire interview costs one, regardless of length. */
  credits: integer('credits').notNull().default(5),
  creditsResetAt: timestamp('credits_reset_at', { withTimezone: true }),

  createdAt: createdAt(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// ── Profile ────────────────────────────────────────────────────────────────

/**
 * The composed resume, which is DERIVED — entries, facts and rules are the
 * source of truth. Editing a fact marks this stale so it can be rebuilt rather
 * than drifting out of step with what the person actually said.
 */
export const profiles = pgTable('profiles', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  resumeStructure: jsonb('resume_structure').notNull().default({}),
  /** Bullet index -> the fact ids supporting it. An uncited bullet is a defect. */
  bulletSources: jsonb('bullet_sources').notNull().default([]),
  /** 0-100, shown on the profile page. Predicts how much hand-editing each tailor needs. */
  strength: integer('strength').notNull().default(0),
  composedAt: timestamp('composed_at', { withTimezone: true }),
  stale: boolean('stale').notNull().default(true),
  updatedAt: updatedAt(),
}, (t) => ({
  userIdx: uniqueIndex('profiles_user_idx').on(t.userId),
}));

/** A job, project or degree. Facts hang off these. */
export const profileEntries = pgTable('profile_entries', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  title: text('title'),
  org: text('org'),
  location: text('location'),
  /** Verbatim, as the person said it — never reformatted. */
  datesDisplay: text('dates_display'),
  /** 0 is most recent. Drives both resume order and which gaps get asked about first. */
  orderIndex: integer('order_index').notNull().default(0),
  source: text('source').notNull().default('interview'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  userKindIdx: index('profile_entries_user_kind_idx').on(t.userId, t.kind, t.orderIndex),
}));

/**
 * One atomic thing the person told us, in their words.
 *
 * A real table rather than a jsonb array: appending to an array means
 * read-modify-write of the whole row, which loses a concurrent edit, and
 * coverage becomes a JS reduce instead of a GROUP BY. Facts are also
 * individually editable and deletable by the user, which an array cannot do.
 */
export const facts = pgTable('facts', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** Null for facts about the person rather than one role — skills, contact details. */
  entryId: text('entry_id').references(() => profileEntries.id, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  text: text('text').notNull(),
  /**
   * Whether the text carries a real quantity. Computed server-side, never taken
   * from the model: a metric fact without a number must not close a metric gap,
   * and that single rule is most of what makes the follow-up questions sharp.
   */
  hasNumber: boolean('has_number').notNull().default(false),
  confidence: real('confidence').notNull().default(1),
  source: text('source').notNull().default('interview'),
  sourceTurnId: text('source_turn_id'),
  status: text('status').notNull().default('active'),
  createdAt: createdAt(),
}, (t) => ({
  entryIdx: index('facts_entry_idx').on(t.userId, t.entryId, t.category),
  categoryIdx: index('facts_category_idx').on(t.userId, t.category),
}));

// ── Interview ──────────────────────────────────────────────────────────────

export const interviewSessions = pgTable('interview_sessions', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('active'),
  phase: text('phase').notNull().default('identity'),
  phaseStartedAtTurn: integer('phase_started_at_turn').notNull().default(0),
  /** Stored so resuming costs no tokens — the question is already decided. */
  pendingQuestion: jsonb('pending_question'),
  /** Points the composed draft could not settle, carried back into the conversation. */
  openQuestions: jsonb('open_questions').notNull().default([]),
  turnCount: integer('turn_count').notNull().default(0),
  startedAt: createdAt(),
  updatedAt: updatedAt(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => ({
  /**
   * At most one live interview per person, enforced rather than assumed.
   * Partial, so completed and abandoned sessions accumulate freely.
   */
  oneActive: uniqueIndex('interview_one_active_idx')
    .on(t.userId)
    .where(sql`${t.status} in ('active', 'paused')`),
}));

export const interviewTurns = pgTable('interview_turns', {
  id: id(),
  sessionId: text('session_id').notNull().references(() => interviewSessions.id, { onDelete: 'cascade' }),
  idx: integer('idx').notNull(),
  question: jsonb('question').notNull(),
  /** Kept verbatim even when extraction found nothing, so a bad turn loses nothing. */
  rawAnswer: text('raw_answer'),
  skipped: boolean('skipped').notNull().default(false),
  createdAt: createdAt(),
}, (t) => ({
  /** Doubles as the idempotency key — a double-submit cannot duplicate facts. */
  seq: uniqueIndex('interview_turns_seq_idx').on(t.sessionId, t.idx),
}));

// ── Applications ───────────────────────────────────────────────────────────

/**
 * The posting, archived.
 *
 * Listings come down within weeks and people need them back before an
 * interview, so the text is stored rather than linked. `requirements` is what
 * makes cross-posting analysis possible — counting demand for a skill across
 * everything someone saved, against what their profile actually says.
 */
export const jobPostings = pgTable('job_postings', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  company: text('company'),
  role: text('role'),
  location: text('location'),
  description: text('description'),
  sourceUrl: text('source_url'),
  /** Normalised skill/requirement strings, extracted once at save time. */
  requirements: jsonb('requirements').notNull().default([]),
  closesAt: timestamp('closes_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => ({
  userIdx: index('job_postings_user_idx').on(t.userId, t.createdAt),
}));

/**
 * One role you are pursuing. This is the row the whole app is organised around.
 *
 * `status` replaces the old single-session flag entirely: an interrupted
 * generation is a row in a state, not a boolean in browser storage.
 */
export const applications = pgTable('applications', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  postingId: text('posting_id').references(() => jobPostings.id, { onDelete: 'set null' }),
  /** draft | applied | interviewing | offer | rejected | withdrawn */
  status: text('status').notNull().default('draft'),
  appliedAt: timestamp('applied_at', { withTimezone: true }),
  /** Set when marked applied. Drives the follow-up nudge that keeps people coming back. */
  followUpDueAt: timestamp('follow_up_due_at', { withTimezone: true }),
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  userStatusIdx: index('applications_user_status_idx').on(t.userId, t.status, t.updatedAt),
  followUpIdx: index('applications_follow_up_idx').on(t.userId, t.followUpDueAt),
}));

/**
 * A generated resume. Every version is kept.
 *
 * An instruction edit inserts a new row pointing at its parent rather than
 * mutating — cheap, and it makes undo and comparison free.
 */
export const resumes = pgTable('resumes', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** Null for a general resume with no target role. */
  applicationId: text('application_id').references(() => applications.id, { onDelete: 'cascade' }),
  mode: text('mode').notNull().default('tailored'),
  structure: jsonb('structure').notNull(),
  matchScore: integer('match_score'),
  missingRequirements: jsonb('missing_requirements').notNull().default([]),
  log: jsonb('log').notNull().default([]),
  warnings: jsonb('warnings').notNull().default([]),
  estimatedPages: integer('estimated_pages'),
  version: integer('version').notNull().default(1),
  parentResumeId: text('parent_resume_id'),
  /** running | complete | failed — what the recovery banner reads instead of localStorage. */
  status: text('status').notNull().default('running'),
  /** Cached compiled PDF, keyed by content hash so an unchanged resume never recompiles. */
  pdfPath: text('pdf_path'),
  createdAt: createdAt(),
}, (t) => ({
  appIdx: index('resumes_application_idx').on(t.applicationId, t.version),
  userIdx: index('resumes_user_idx').on(t.userId, t.createdAt),
}));

// ── Rules ──────────────────────────────────────────────────────────────────

/** Persistent preferences, applied to every generation. One row each so they can be toggled. */
export const rules = pgTable('rules', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  active: boolean('active').notNull().default(true),
  orderIndex: integer('order_index').notNull().default(0),
  source: text('source').notNull().default('user'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  userIdx: index('rules_user_idx').on(t.userId, t.orderIndex),
}));

// ── Documents ──────────────────────────────────────────────────────────────

/** Uploaded files. Bytes live in object storage; only the pointer lives here. */
export const documents = pgTable('documents', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  storagePath: text('storage_path').notNull(),
  /** Anthropic Files API id, so a PDF is uploaded once rather than on every call. */
  anthropicFileId: text('anthropic_file_id'),
  extractedAt: timestamp('extracted_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => ({
  userIdx: index('documents_user_idx').on(t.userId, t.kind),
}));

// ── Metering ───────────────────────────────────────────────────────────────

/**
 * Every model call, recorded.
 *
 * Written by the one function all Anthropic calls pass through, so a future
 * handler cannot silently skip metering. Also what the daily spend ceiling
 * reads — the mechanism that stops one script becoming a very expensive
 * morning.
 */
export const usageEvents = pgTable('usage_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
  cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }).notNull(),
  resumeId: text('resume_id'),
  sessionId: text('session_id'),
  createdAt: createdAt(),
}, (t) => ({
  userIdx: index('usage_events_user_idx').on(t.userId, t.createdAt),
  /** For the global daily ceiling, which sums across all users. */
  dayIdx: index('usage_events_day_idx').on(t.createdAt),
}));
