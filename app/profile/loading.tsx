import PageSkeleton from '../components/PageSkeleton';

/** Held in place while the server reads. Without it the page sits blank. */
export default function Loading() {
  return <PageSkeleton />;
}
