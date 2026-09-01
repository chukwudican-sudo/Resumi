import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';

export type NavKey = 'applications' | 'insights' | 'profile';

const ITEMS: { key: NavKey; href: string; label: string }[] = [
  { key: 'applications', href: '/applications', label: 'Applications' },
  { key: 'insights', href: '/insights', label: 'Insights' },
  { key: 'profile', href: '/profile', label: 'Profile' },
];

/**
 * The bar across every signed-in page.
 *
 * Three destinations, all of which are places you return to. Onboarding and the
 * questions are not here on purpose — they are things you pass through, and
 * putting a one-time flow in permanent navigation is how an app ends up feeling
 * like a settings menu.
 */
export default function AppNav({ active, credits }: { active: NavKey; credits?: number }) {
  return (
    <header className="flex h-[62px] items-center justify-between border-b border-rule bg-ground-surface px-9">
      <div className="flex items-center gap-10">
        <Link href="/applications" className="flex items-center gap-2.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2F5D50" strokeWidth="1.5" strokeLinecap="round">
            <path d="M12 3v18M3 12h18M6 6l12 12M18 6L6 18" />
          </svg>
          <span className="text-[12.5px] uppercase tracking-[0.16em] text-ink-prose">Resumi</span>
        </Link>

        <nav className="flex items-center gap-7">
          {ITEMS.map((item) =>
            item.key === active ? (
              <span
                key={item.key}
                className="border-b-2 border-accent py-[19px] text-sm text-ink"
              >
                {item.label}
              </span>
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

      <div className="flex items-center gap-4">
        {typeof credits === 'number' ? (
          <span className="text-[13px] text-ink-muted">
            {credits} of 5 free left
          </span>
        ) : null}
        <UserButton
          appearance={{ elements: { avatarBox: 'h-7 w-7' } }}
          afterSignOutUrl="/"
        />
      </div>
    </header>
  );
}
