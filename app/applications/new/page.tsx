import { redirect } from 'next/navigation';
import NewApplicationForm from '../../components/applications/NewApplicationForm';
import { requireUserId } from '../../server/auth';
import { getProfile } from '../../server/db/repository';
import type { ResumeStructure } from '../../lib/types';
import { hasEnoughToTailor } from '../../lib/readiness';
import { countFacts } from '../../server/db/repository';

/**
 * Adding a job. Requires a profile — there is nothing to tailor from without
 * one, and sending someone here first would only strand them.
 *
 * "A profile" used to mean a name and nothing else, which let somebody through
 * with an empty resume and cost them a credit on the other side. It now means a
 * name and at least one thing they have done.
 */
export default async function NewApplicationPage() {
  const userId = await requireUserId();
  const profile = await getProfile(userId);
  const structure = (profile?.resumeStructure ?? null) as ResumeStructure | null;

  // To /setup, not /onboarding. Onboarding sends anyone with a name straight
  // back to /applications, so failing to it would bounce this person between
  // two pages and land them on a list with nothing explained. The editor is
  // what they actually need, and it now says what is missing.
  if (!hasEnoughToTailor(structure)) redirect('/setup');

  const detailCount = await countFacts(userId);
  return <NewApplicationForm detailCount={detailCount} />;
}
