'use client';

import { UserButton } from '@clerk/nextjs';

/**
 * The avatar, and what is under it.
 *
 * Your profile lives here because that is where account things are on every
 * other site. It is not a fifth nav item — it is not a fifth destination, it
 * is where you go to look at yourself.
 *
 * Before this, nothing in the app linked to /profile at all. The single
 * navigation to it was the interview redirecting there on completion, and the
 * interview could only be started from the profile page — so the page you
 * delete your data from sat behind a door that opened only from the inside.
 * The privacy policy and the terms both point people at that button, which
 * made them wrong about the product, not just inconvenient.
 *
 * A client component on purpose. UserButton.MenuItems identifies its children
 * by component type at render, and rather than establish whether that survives
 * the server/client boundary, this puts the whole thing on the side of the
 * boundary where Clerk's API is unambiguously supported.
 */
export default function UserMenu() {
  return (
    <UserButton appearance={{ elements: { avatarBox: 'h-7 w-7' } }} afterSignOutUrl="/">
      {/*
        Listed explicitly so the order is ours: your profile first, then
        Clerk's account — which is about signing in, not about the resume —
        then sign out.
      */}
      <UserButton.MenuItems>
        <UserButton.Link label="Account" href="/account" labelIcon={<AccountIcon />} />
        <UserButton.Action label="manageAccount" />
        <UserButton.Action label="signOut" />
      </UserButton.MenuItems>
    </UserButton>
  );
}

/** Sized to sit with Clerk's own menu icons rather than shout over them. */
function AccountIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
