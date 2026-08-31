import OnboardingShell from '../components/onboarding/OnboardingShell';

/**
 * Not wrapped in AppFrame. The desktop-only gate is defensible for the
 * side-by-side PDF review; it is not defensible on the first screen a new
 * person ever sees.
 */
export default function OnboardingPage() {
  return <OnboardingShell />;
}
