'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

// 'account' is deliberately absent from ITEMS below: /account renders this bar
// with nothing highlighted. It used to borrow the key belonging to the item
// labelled "Resume", so standing on the account page underlined a tab that led
// somewhere else entirely.
export type NavKey = 'applications' | 'insights' | 'profile' | 'rules' | 'account';

const ITEMS: { key: NavKey; href: string; label: string }[] = [
  { key: 'applications', href: '/applications', label: 'Applications' },
  { key: 'insights', href: '/insights', label: 'Insights' },
  { key: 'profile', href: '/setup', label: 'Resume' },
  { key: 'rules', href: '/rules', label: 'Rules' },
];

/**
 * The mark and the four destinations — the left half of the bar, everywhere.
 *
 * Lifted out of AppNav so /setup can have it too. /setup renders its own bar
 * rather than AppNav, because that bar also carries Polish, Download and Done —
 * and the result was that the one screen that IS a nav tab was the only signed-in
 * screen you could not navigate from. A top-level destination with no way to
 * reach the others.
 */
export default function NavTabs({
  active,
  onNavigate,
}: {
  active: NavKey;
  /**
   * Asked before leaving; false cancels it.
   *
   * For /setup, which has to put the unsaved-changes question in front of every
   * way off the page. Without it these tabs would be the quickest route to
   * losing a form — the same hole the rail was closed against.
   */
  onNavigate?: () => Promise<boolean>;
}) {
  const router = useRouter();

  async function go(href: string) {
    if (onNavigate && !(await onNavigate())) return;
    router.push(href);
  }

  return (
    <div className="flex items-center gap-10">
      <Link href="/applications" className="flex items-center gap-2.5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2F5D50" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18" />
        </svg>
        <span className="text-[12.5px] uppercase tracking-[0.16em] text-ink-prose">Resumi9</span>
      </Link>

      <nav className="flex items-center gap-7">
        {ITEMS.map((item) =>
          item.key === active ? (
            <span key={item.key} className="border-b-2 border-accent py-[19px] text-sm text-ink">
              {item.label}
            </span>
          ) : onNavigate ? (
            // A button, not a Link: a Link navigates before anything can be said
            // about the unsaved form underneath it.
            <button
              key={item.key}
              type="button"
              onClick={() => void go(item.href)}
              className="text-sm text-ink-muted transition hover:text-ink"
            >
              {item.label}
            </button>
          ) : (
            <Link
              key={item.key}
              href={item.href}
              className="text-sm text-ink-muted transition hover:text-ink"
            >
              {item.label}
            </Link>
          ),
        )}
      </nav>
    </div>
  );
}
