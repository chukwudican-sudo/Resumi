import { SignIn } from '@clerk/nextjs';
import AuthFrame from '../../components/auth/AuthFrame';
import { clerkAppearance } from '../../components/auth/clerkAppearance';

export default function SignInPage() {
  return (
    <AuthFrame
      title="Welcome back"
      subtitle="Your profile and every resume you have made are here."
    >
      <SignIn appearance={clerkAppearance} />
    </AuthFrame>
  );
}
