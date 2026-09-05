'use server';

import { revalidatePath } from 'next/cache';
import { requireUserId } from './auth';
import {
  createRule as createRuleRow,
  deleteUserData,
  deleteEntry as deleteEntryRow,
  deleteRule as deleteRuleRow,
  reorderRules as reorderRulesRow,
  setRuleActive as setRuleActiveRow,
  updateRule as updateRuleRow,
  getResumeInputs,
  markApplied as markAppliedRow,
  restoreResumeVersion as restoreResumeVersionRow,
  setApplicationStatus as setApplicationStatusRow,
  saveContactDetails as saveContactRow,
  saveMasterResume,
  saveSkillGroups,
  setOnboardingGoal as setGoalRow,
  upsertEntry as upsertEntryRow,
} from './db/repository';
import { buildResume, entryFromRow, type EntryWithBullets } from '../lib/buildResume';
import type { ResumeStructure } from '../lib/types';
import { profileStrength } from '../lib/profileStrength';
import { runPolish } from './polishProfile';
import { getProfile, getUser } from './db/repository';
import { RULE_MAX_LENGTH } from '../lib/rules';

/**
 * Mutations the UI can call directly.
 *
 * Every one of them starts by resolving the signed-in user server-side and
 * passes that id down — the client never says who it is, so it cannot claim to
 * be someone else. Ids arriving from the browser are always treated as a
 * request to act on something, never as proof of ownership; the repository
 * scopes by user on top.
 */

export async function saveOnboardingGoal(stage: string, targetField: string) {
  const userId = await requireUserId();

  const allowed = ['internship', 'new_grad', 'experienced'];
  if (!allowed.includes(stage)) throw new Error(`Unknown career stage: ${stage}`);

  await setGoalRow(userId, stage, targetField.trim().slice(0, 120));
  revalidatePath('/profile');
}

export async function markApplicationApplied(applicationId: string) {
  const userId = await requireUserId();
  await markAppliedRow(userId, applicationId);
  revalidatePath('/applications');
  revalidatePath(`/applications/${applicationId}`);
}

/**
 * The contact block from onboarding.
 *
 * Every field is optional except the ones the account already supplied, and
 * nothing is validated beyond trimming — a resume is not a form to be policed,
 * and rejecting an unusual phone format would be worse than printing it.
 */
export async function saveContactDetails(details: {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  website: string;
}) {
  const userId = await requireUserId();

  await saveContactRow(userId, [
    { label: 'Name', value: details.name },
    { label: 'Email', value: details.email },
    { label: 'Phone', value: details.phone },
    { label: 'Location', value: details.location },
    { label: 'LinkedIn', value: details.linkedin },
    { label: 'GitHub', value: details.github },
    { label: 'Website', value: details.website },
  ]);

  revalidatePath('/profile');
}

/**
 * Re-renders and stores the master resume.
 *
 * Called after every edit rather than on demand, so the resume other pages read
 * is never out of step with what the person last typed. It is a pure function
 * of the rows, so this costs a render and a write — no model, no latency.
 */
async function refreshMasterResume(userId: string) {
  const { entryRows, factRows } = await getResumeInputs(userId);
  const entries: EntryWithBullets[] = entryRows.map(entryFromRow);

  const structure = buildResume(entries, factRows);
  await saveMasterResume(userId, structure, profileStrength(structure));
  return structure;
}

export interface EntryInput {
  id: string | null;
  kind: 'experience' | 'education' | 'project';
  title: string;
  org: string;
  location: string;
  datesDisplay: string;
  tech: string;
  bullets: string[];
  dates: {
    startMonth: number | null;
    startYear: number | null;
    endMonth: number | null;
    endYear: number | null;
    isCurrent: boolean;
  };
  place: { city: string | null; region: string | null; country: string | null };
  url: string;
  extra: Record<string, string>;
}

export async function saveEntry(entry: EntryInput) {
  const userId = await requireUserId();

  const allowed = ['experience', 'education', 'project'];
  if (!allowed.includes(entry.kind)) throw new Error(`Unknown entry kind: ${entry.kind}`);

  await upsertEntryRow(userId, entry);
  await refreshMasterResume(userId);
  revalidatePath('/setup');
  revalidatePath('/profile');
}

export async function removeEntry(entryId: string) {
  const userId = await requireUserId();
  await deleteEntryRow(userId, entryId);
  await refreshMasterResume(userId);
  revalidatePath('/setup');
  revalidatePath('/profile');
}

export async function saveSkills(groups: { category: string; items: string }[]) {
  const userId = await requireUserId();
  await saveSkillGroups(userId, groups.slice(0, 8));
  await refreshMasterResume(userId);
  revalidatePath('/setup');
  revalidatePath('/profile');
}

export async function saveContactAndRefresh(details: {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  website: string;
}) {
  const userId = await requireUserId();
  await saveContactRow(userId, [
    { label: 'Name', value: details.name },
    { label: 'Email', value: details.email },
    { label: 'Phone', value: details.phone },
    { label: 'Location', value: details.location },
    { label: 'LinkedIn', value: details.linkedin },
    { label: 'Website', value: details.website },
  ]);
  await refreshMasterResume(userId);
  revalidatePath('/setup');
  revalidatePath('/profile');
}


// ── Rules ──────────────────────────────────────────────────────────────────

/**
 * The instructions someone wants applied to every resume they make.
 *
 * Kept as rows the person can read, edit and switch off rather than as a blob
 * of remembered preferences: a rule that silently shapes every resume without
 * being visible is indistinguishable from the tool having an opinion of its
 * own, and the first time it produces something unexpected there is nothing to
 * look at.
 */

export async function addRule(text: string) {
  const userId = await requireUserId();
  const trimmed = text.trim();
  if (!trimmed) return;
  await createRuleRow(userId, trimmed.slice(0, RULE_MAX_LENGTH));
  revalidatePath('/rules');
}

export async function editRule(ruleId: string, text: string) {
  const userId = await requireUserId();
  const trimmed = text.trim();
  if (!trimmed) return;
  await updateRuleRow(userId, ruleId, trimmed.slice(0, RULE_MAX_LENGTH));
  revalidatePath('/rules');
}

export async function toggleRule(ruleId: string, active: boolean) {
  const userId = await requireUserId();
  await setRuleActiveRow(userId, ruleId, active);
  revalidatePath('/rules');
}

export async function removeRule(ruleId: string) {
  const userId = await requireUserId();
  await deleteRuleRow(userId, ruleId);
  revalidatePath('/rules');
}

export async function reorderRules(orderedIds: string[]) {
  const userId = await requireUserId();
  await reorderRulesRow(userId, orderedIds);
  revalidatePath('/rules');
}


// ── Polish ─────────────────────────────────────────────────────────────────

/**
 * Runs the editorial pass over the master resume.
 *
 * Typing your history into a form gets the facts down. It does not decide that
 * "California" reads as "CA", that your skills belong in four named groups, or
 * that your projects should sit above your jobs — those are judgments, and
 * making the person perform them in a form is making them do the work they came
 * here to hand over.
 *
 * Kept separate from saving so that typing stays instant and free. A save marks
 * the profile stale; this is what clears it.
 */
export async function polishMasterResume(): Promise<{
  warnings: string[];
  corrections: { from: string; to: string; reason: string }[];
  sections: { key: string; label: string }[];
}> {
  const userId = await requireUserId();
  const [profile, user] = await Promise.all([getProfile(userId), getUser(userId)]);

  const structure = profile?.resumeStructure as ResumeStructure | null;
  if (!structure?.name) {
    return { warnings: ['Add your name and at least one entry first.'], corrections: [], sections: [] };
  }

  const polish = await runPolish(userId, structure, user?.locale ?? null);

  revalidatePath('/setup');
  revalidatePath('/profile');
  return { warnings: polish.warnings, corrections: polish.corrections, sections: polish.sections };
}


// ── Deleting everything ────────────────────────────────────────────────────

/**
 * Removes everything Resumi holds about this person.
 *
 * Every table referencing users cascades, so one delete takes the profile,
 * entries, facts, rules, applications, resumes, interview history and usage
 * records with it. Verified against the schema rather than assumed: ten
 * foreign keys, all cascading.
 *
 * The sign-in itself is not touched. That belongs to Clerk and is deleted from
 * Clerk's own account menu — promising to remove something we do not control
 * would be the wrong kind of reassurance.
 *
 * Nothing is archived, soft-deleted or retained. A delete that keeps a copy is
 * not a delete, and this is the page where that has to be literally true.
 */
export async function deleteEverything() {
  const userId = await requireUserId();
  await deleteUserData(userId);
  revalidatePath('/', 'layout');
}


/**
 * Records where an application now stands.
 *
 * The list of allowed values lives here rather than being trusted from the
 * client: a status arrives as a string from a browser, and an unrecognised one
 * would be written straight into the column and then read by code that
 * switches on it.
 */
const STATUSES = ['draft', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn'] as const;

export async function setApplicationStatus(applicationId: string, status: string) {
  const userId = await requireUserId();
  if (!(STATUSES as readonly string[]).includes(status)) {
    throw new Error(`Unknown application status: ${status}`);
  }
  await setApplicationStatusRow(userId, applicationId, status);
  revalidatePath('/applications');
  revalidatePath(`/applications/${applicationId}`);
}


/** Brings back an earlier version of a tailored resume, as a new version. */
export async function restoreResumeVersion(applicationId: string, resumeId: string) {
  const userId = await requireUserId();
  const restored = await restoreResumeVersionRow(userId, applicationId, resumeId);
  if (!restored) throw new Error('That version could not be found.');
  revalidatePath(`/applications/${applicationId}`);
}
