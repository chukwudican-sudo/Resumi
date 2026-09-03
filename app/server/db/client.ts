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

type Db = ReturnType<typeof create>;

declare global {
  // eslint-disable-next-line no-var
  var __resumiDb: Db | undefined;
}

function create(): ReturnType<typeof drizzle<typeof schema>> {
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
 * Connects on first query, not on import.
 *
 * This used to run `create()` at module load, which made merely importing
 * anything downstream of the repository throw without a DATABASE_URL — so a
 * pure unit test could not import a module that happened to sit above a query
 * three files away. Module-load side effects turn an import graph into a
 * runtime dependency graph; deferring the connection keeps importing free and
 * leaves the error for whoever actually runs a query.
 *
 * The instance is still cached on globalThis in development, because without
 * that every hot reload opens another pool and the connection limit is reached
 * within a few minutes of editing.
 */
function resolve(): Db {
  const existing = globalThis.__resumiDb;
  if (existing) return existing;
  const created = create();
  if (process.env.NODE_ENV !== 'production') globalThis.__resumiDb = created;
  return created;
}

export const db = new Proxy({} as Db, {
  get(_target, property, receiver) {
    return Reflect.get(resolve() as object, property, receiver);
  },
});
