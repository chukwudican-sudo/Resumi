import NavTabs, { type NavKey } from './NavTabs';
import UserMenu from './UserMenu';
import { creditsLabel } from '../lib/credits';

export type { NavKey } from './NavTabs';

/**
 * The bar across every signed-in page.
 *
 * Four destinations, all of which are places you return to. Onboarding and the
 * questions are not here on purpose — they are things you pass through, and
 * putting a one-time flow in permanent navigation is how an app ends up feeling
 * like a settings menu.
 */
export default function AppNav({ active, credits }: { active: NavKey; credits?: number }) {
  return (
    <header className="flex h-[62px] items-center justify-between border-b border-rule bg-ground-surface px-9">
      <NavTabs active={active} />

      <div className="flex items-center gap-4">
        {typeof credits === 'number' ? (
          // Louder as it runs out. A count that looks the same at five and at
          // zero is a count nobody reads until the thing stops working.
          <span
            className={`rounded px-2.5 py-1 text-[13px] ${
              credits === 0
                ? 'bg-flag-bg text-flag'
                : credits === 1
                  ? 'text-flag'
                  : 'text-ink-muted'
            }`}
          >
            {creditsLabel(credits)}
          </span>
        ) : null}
        <UserMenu />
      </div>
    </header>
  );
}
