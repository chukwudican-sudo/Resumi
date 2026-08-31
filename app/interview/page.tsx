import InterviewShell from '../components/interview/InterviewShell';

/**
 * Deliberately not wrapped in AppFrame.
 *
 * AppFrame hides everything below the xl breakpoint and tells the visitor to
 * come back on a laptop. That is defensible for the side-by-side PDF review,
 * but the interview is the first thing a new person does, and turning away
 * everyone on a phone at the front door would be a strange way to run an
 * onboarding flow.
 */
export default function InterviewPage() {
  return <InterviewShell />;
}
