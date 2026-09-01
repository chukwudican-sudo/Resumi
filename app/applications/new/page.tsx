import { redirect } from 'next/navigation';
import NewApplicationForm from '../../components/applications/NewApplicationForm';
import { requireUserId } from '../../server/auth';
import { getProfile } from '../../server/db/repository';
import type { ResumeStructure } from '../../lib/types';
import { countFacts } from '../../server/db/repository';

/**
 * Adding a job. Requires a profile — there is nothing to tailor from without
 * one, and sending someone here first would only strand them.
 */
export default async function NewApplicationPage() {
  const userId = await requireUserId();
  const profile = await getProfile(userId);
  const structure = (profile?.resumeStructure ?? null) as ResumeStructure | null;

  if (!structure?.name) redirect('/onboarding');

  const detailCount = await countFacts(userId);
  return <NewApplicationForm detailCount={detailCount} />;
}
