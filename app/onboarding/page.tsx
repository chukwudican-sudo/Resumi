import { redirect } from 'next/navigation';
import OnboardingFlow, { type Contact } from '../components/onboarding/OnboardingFlow';
import { requireUserId } from '../server/auth';
import { getActiveFacts, getProfile, getUser } from '../server/db/repository';

/**
 * First run. Someone who already has a profile has no business here — sending
 * them back to their applications is kinder than showing setup they finished.
 */
export default async function OnboardingPage() {
  const userId = await requireUserId();
  const [user, profile, facts] = await Promise.all([
    getUser(userId),
    getProfile(userId),
    getActiveFacts(userId),
  ]);

  if (profile && !profile.stale) redirect('/applications');

  // Pre-fill from what is already known: the account supplies name and email,
  // and anything filled in on a previous pass through this screen is kept.
  const pick = (label: string) =>
    facts.find((f) => f.category === 'identity' && f.text.startsWith(`${label}: `))?.text.slice(label.length + 2) ?? '';

  const contact: Contact = {
    name: pick('Name') || user?.displayName || '',
    email: pick('Email') || user?.email || '',
    phone: pick('Phone'),
    location: pick('Location'),
    linkedin: pick('LinkedIn'),
    website: pick('Website'),
  };

  return (
    <OnboardingFlow
      initialStage={user?.stage ?? ''}
      initialField={user?.targetField ?? ''}
      initialContact={contact}
    />
  );
}
