'use server';

import { revalidatePath } from 'next/cache';
import { requireUserId } from './auth';
import {
  deleteEntry as deleteEntryRow,
  getResumeInputs,
  markApplied as markAppliedRow,
  saveContactDetails as saveContactRow,
  saveMasterResume,
  saveSkillGroups,
  setOnboardingGoal as setGoalRow,
  upsertEntry as upsertEntryRow,
} from './db/repository';
import { buildResume, type EntryWithBullets } from '../lib/buildResume';
import { profileStrength } from '../lib/profileStrength';

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
  const entries: EntryWithBullets[] = entryRows.map((e) => ({
    id: e.id,
    kind: e.kind as EntryWithBullets['kind'],
    title: e.title ?? undefined,
    org: e.org ?? undefined,
    location: e.location ?? undefined,
    datesDisplay: e.datesDisplay ?? undefined,
    orderIndex: e.orderIndex,
    source: e.source as EntryWithBullets['source'],
    bullets: (e.bullets as string[]) ?? [],
    tech: e.tech,
  }));

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
