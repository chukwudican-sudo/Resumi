/**
 * The one spinner.
 *
 * These four lines existed twice, byte for byte — once in ApplicationView and
 * once in the interview, which redirects away — and nowhere else, so most of
 * the app's waiting was announced by a greyed-out button and nothing more.
 *
 * A ring rather than dots or a bar: a bar implies a proportion, and nothing in
 * this app can honestly claim one except an upload.
 */
export default function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-rule border-t-accent ${className}`}
    />
  );
}
