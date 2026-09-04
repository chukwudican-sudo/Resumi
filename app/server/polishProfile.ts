import { polishResume, type PolishResult } from '../lib/polish';
import { profileStrength } from '../lib/profileStrength';
import type { ResumeStructure } from '../lib/types';
import { getProfile, getUser, saveMasterResume } from './db/repository';

/**
 * Polishes the master resume, if it needs it.
 *
 * The pass used to be a button, which meant almost nobody would ever run it.
 * Someone signs up, fills the form, presses Download, and receives a resume
 * whose skills are still the sentences they typed and whose sections are in
 * whatever order the renderer defaults to. That was the *ordinary* outcome, not
 * an edge case — the good version was hidden behind a control nothing pointed
 * at.
 *
 * Returns null when nothing needed doing, so callers can tell the difference
 * between "already current" and "just changed under you" and say so.
 *
 * A failure here is deliberately not fatal. Polishing improves a resume; not
 * polishing is a worse resume, not a broken one, and refusing to hand over
 * someone's own document because an optional model call failed would be the
 * wrong trade every time.
 */
export async function polishIfStale(userId: string): Promise<PolishResult | null> {
  const [profile, user] = await Promise.all([getProfile(userId), getUser(userId)]);
  if (!profile?.stale) return null;

  const structure = profile.resumeStructure as ResumeStructure | null;
  if (!structure?.name) return null;

  try {
    const { polish, applied } = await polishResume(userId, structure, user?.locale ?? null);
    await saveMasterResume(userId, applied, profileStrength(applied));
    return polish;
  } catch (error) {
    console.error('[Resumi] Automatic polish failed; continuing unpolished.', error);
    return null;
  }
}
