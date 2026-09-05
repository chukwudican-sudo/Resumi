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

  // Having a resume is the question, not whether it has been polished lately.
  // This used to read `!profile.stale`, and stale means "needs the editorial
  // pass" — it turns true on every save. So anybody with a finished resume and
  // one unsaved edit was pushed back through the wizard as though they were
  // new, which is a strange thing to do to somebody who has already finished.
  const structure = profile?.resumeStructure as { name?: string } | null;
  if (structure?.name) redirect('/applications');

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
    github: pick('GitHub'),
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
