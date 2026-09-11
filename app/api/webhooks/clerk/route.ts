import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { deleteUserData, seedIdentityFacts, upsertUser } from '../../../server/db/repository';

/**
 * Keeps the users table in step with Clerk.
 *
 * This is the only route the middleware lets through unauthenticated, because
 * Clerk calls it with no session. That makes signature verification the whole
 * security boundary: without it, anyone who learns the URL could create or —
 * far worse — delete accounts. The secret is required rather than optional for
 * that reason; a webhook that silently skips verification when misconfigured is
 * the same as having none.
 */

interface ClerkUserEvent {
  type: string;
  data: {
    id: string;
    email_addresses?: { id: string; email_address: string }[];
    primary_email_address_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  };
}

function primaryEmail(data: ClerkUserEvent['data']): string | null {
  const addresses = data.email_addresses ?? [];
  if (addresses.length === 0) return null;
  const primary = addresses.find((a) => a.id === data.primary_email_address_id);
  return (primary ?? addresses[0]).email_address ?? null;
}

function displayName(data: ClerkUserEvent['data']): string | undefined {
  const name = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
  return name || undefined;
}

export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[Resumi] CLERK_WEBHOOK_SECRET is not set — refusing to process the webhook.');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const headerList = await headers();
  const svixId = headerList.get('svix-id');
  const svixTimestamp = headerList.get('svix-timestamp');
  const svixSignature = headerList.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 });
  }

  // Verify against the RAW body. Parsing first and re-serialising would change
  // the bytes and the signature would never match.
  const payload = await request.text();

  /*
   * Verify, then parse. Two steps, and it has to be two.
   *
   * svix 1.x returned the parsed payload from verify(); 2.x returns nothing and
   * only throws. The `as unknown as ClerkUserEvent` cast on the old call papered
   * over exactly that change — TypeScript was told the answer's shape rather than
   * asked, so `event` silently became undefined and `event.type` below threw on
   * every single delivery. Sixty-four failures, all of them this, and the
   * webhook had never once succeeded.
   *
   * The lesson is in the cast: `as unknown as X` is a promise the compiler
   * cannot check, so it is the one place a library's breaking change arrives
   * with no warning at all.
   */
  try {
    new Webhook(secret).verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Separate from the signature failure above on purpose: a verified body that
  // will not parse is a different problem from a forged one, and saying so is
  // what stops the next person debugging the wrong thing.
  let event: ClerkUserEvent;
  try {
    event = JSON.parse(payload) as ClerkUserEvent;
  } catch {
    console.error('[Resumi] Webhook payload verified but would not parse.');
    return NextResponse.json({ error: 'Malformed payload' }, { status: 400 });
  }

  if (!event?.type || !event.data?.id) {
    console.error('[Resumi] Webhook payload is missing "type" or "data.id".');
    return NextResponse.json({ error: 'Malformed payload' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'user.created':
      case 'user.updated': {
        const email = primaryEmail(event.data);
        if (!email) {
          // Nothing useful to store, but not Clerk's fault to retry over.
          console.warn(`[Resumi] ${event.type} for ${event.data.id} carried no email address.`);
          break;
        }
        // Idempotent: Clerk retries deliveries, and the same event may arrive twice.
        const name = displayName(event.data);
        await upsertUser(event.data.id, email, name);

        // Seeded here as well as in syncCurrentUser, because whichever of the
        // two wins the race is the one that creates the row — and syncCurrentUser
        // seeds ONLY when it creates it. In production this webhook usually
        // wins, so the facts were never written: the setup rail read the facts
        // table and said "Name and email needed" beside a form already showing
        // both. Locally there is no webhook, which is exactly why it could not
        // be reproduced.
        //
        // Only on creation. A name edited in Clerk afterwards must not reach
        // back into a resume the person has since made their own.
        if (event.type === 'user.created') {
          await seedIdentityFacts(event.data.id, name ?? null, email);
        }
        break;
      }

      case 'user.deleted': {
        // Every table cascades from users, so this removes the whole graph —
        // facts, postings, applications, resumes. Deleting an account has to
        // actually delete, not merely hide.
        await deleteUserData(event.data.id);
        break;
      }

      default:
        // Other event types are fine to ignore; acknowledging stops Clerk retrying.
        break;
    }
  } catch (error) {
    // A 500 makes Clerk retry, which is what we want for a transient database
    // failure — the alternative is silently losing a user row.
    console.error('[Resumi] Webhook handling failed:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
