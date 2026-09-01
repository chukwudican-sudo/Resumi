import { redirect } from 'next/navigation';

/** Superseded by the applications list. Kept so old links do not dead-end. */
export default function WorkspacePage() {
  redirect('/applications');
}
