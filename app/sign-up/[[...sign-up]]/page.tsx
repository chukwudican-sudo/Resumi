import { SignUp } from '@clerk/nextjs';
import AuthFrame from '../../components/auth/AuthFrame';
import { clerkAppearance } from '../../components/auth/clerkAppearance';

export default function SignUpPage() {
  return (
    <AuthFrame
      title="Create your account"
      subtitle="So your profile and every resume you make are here when you come back."
    >
      <SignUp appearance={clerkAppearance} />
    </AuthFrame>
  );
}
