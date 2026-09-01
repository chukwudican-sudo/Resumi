import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { deleteUserData, upsertUser } from '../../../server/db/repository';

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

  let event: ClerkUserEvent;
  try {
    event = new Webhook(secret).verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as unknown as ClerkUserEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
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
        await upsertUser(event.data.id, email, displayName(event.data));
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
