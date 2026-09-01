'use server';

import { revalidatePath } from 'next/cache';
import { requireUserId } from './auth';
import {
  markApplied as markAppliedRow,
  saveContactDetails as saveContactRow,
  setOnboardingGoal as setGoalRow,
} from './db/repository';

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
