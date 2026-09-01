import { redirect } from 'next/navigation';
import OnboardingFlow from '../components/onboarding/OnboardingFlow';
import { requireUserId } from '../server/auth';
import { getProfile, getUser } from '../server/db/repository';

/**
 * First run. Someone who already has a profile has no business here — sending
 * them back to their applications is kinder than showing setup they finished.
 */
export default async function OnboardingPage() {
  const userId = await requireUserId();
  const [user, profile] = await Promise.all([getUser(userId), getProfile(userId)]);

  if (profile && !profile.stale) redirect('/applications');

  return <OnboardingFlow initialStage={user?.stage ?? ''} initialField={user?.targetField ?? ''} />;
}
