import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * The database connection.
 *
 * Deliberately not exported beyond this directory. Every query must go through
 * a function in `app/server/db/` that takes a userId — see the note in
 * `repository.ts`. The single most likely way to leak one person's resume to
 * another is a forgotten `where user_id`, and the only reliable defence is
 * making the raw client unreachable from feature code.
 */

declare global {
  // eslint-disable-next-line no-var
  var __resumiDb: ReturnType<typeof create> | undefined;
}

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy it from your Supabase project (Settings → Database → Connection string → Transaction pooler) into .env.local.',
    );
  }

  // `prepare: false` is required by Supabase's transaction pooler: prepared
  // statements are per-connection, and the pooler hands out a different backend
  // per transaction, so a prepared statement is rarely there when reused.
  const sql = postgres(url, { prepare: false });

  return drizzle(sql, { schema });
}

/**
 * Reused across hot reloads. Without this, every edit in dev opens another pool
 * and the connection limit is reached within a few minutes of work.
 */
export const db = globalThis.__resumiDb ?? create();
if (process.env.NODE_ENV !== 'production') globalThis.__resumiDb = db;
