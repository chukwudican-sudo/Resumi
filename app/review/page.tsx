import { redirect } from 'next/navigation';

/** Reviewing now happens per application, at /applications/[id]. */
export default function ReviewPage() {
  redirect('/applications');
}
