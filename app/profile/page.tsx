import { redirect } from 'next/navigation';

/**
 * Kept as a redirect rather than deleted outright.
 *
 * This page listed the resume a second time and held the account settings; the
 * resume half moved to /setup and the rest became /account. The path stays so
 * an old bookmark, or a link somebody was sent, still arrives somewhere.
 */
export default function ProfilePage() {
  redirect('/account');
}
