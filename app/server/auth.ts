import { auth } from '@clerk/nextjs/server';
import { getUser, seedIdentityFacts, upsertUser } from './db/repository';

/**
 * Who is asking.
 *
 * Every route handler and server component that touches user data starts here.
 * The id it returns is the same string used as the primary key in `users`, so
 * there is exactly one identity in the system rather than a Clerk one and a
 * database one that have to be kept in step.
 */

/** The signed-in user's id, or null. */
export async function currentUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? null;
}

/**
 * The id, or throws.
 *
 * For routes the middleware already protects — there, being signed out is not a
 * case to handle gracefully, it is a bug in the route matcher, and throwing
 * surfaces it immediately rather than letting a request run with no owner.
 */
export async function requireUserId(): Promise<string> {
  const userId = await currentUserId();
  if (!userId) throw new Error('Not signed in. This route should be covered by middleware.');
  return userId;
}

/**
 * The user's row, creating it if the webhook has not arrived yet.
 *
 * Clerk delivers `user.created` asynchronously, and someone can land on the app
 * before it does. Without this, a brand-new account's first request fails on a
 * missing foreign key — a rare, confusing, first-impression bug. The upsert is
 * idempotent, so the webhook arriving later changes nothing.
 */
export async function ensureUser(userId: string, email: string, displayName?: string) {
  const existing = await getUser(userId);
  if (existing) return existing;
  return upsertUser(userId, email, displayName);
}

/**
 * Makes sure the signed-in person has a row, and returns it.
 *
 * Deliberately ordered so the expensive part runs once per user rather than
 * once per request: the id comes from the session token, the existence check is
 * a primary-key lookup, and only a genuine miss reaches for Clerk's API to
 * fetch the email. In practice that is a new account's first page load.
 *
 * This is a safety net, not the main path — the webhook is. But the webhook
 * needs a public URL, so in local development it is the only thing that makes
 * a signed-in person exist in the database at all.
 */
export async function syncCurrentUser() {
  const userId = await currentUserId();
  if (!userId) return null;

  const existing = await getUser(userId);
  if (existing) return existing;

  const { currentUser } = await import('@clerk/nextjs/server');
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const email =
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress;
  if (!email) {
    console.error(`[Resumi] Clerk user ${userId} has no email address; cannot create their row.`);
    return null;
  }

  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim();
  const row = await upsertUser(userId, email, name || undefined);

  // Hand the interview what the account already knows, so its first question is
  // about their work rather than their name.
  await seedIdentityFacts(userId, name || null, email);

  return row;
}
