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
  const sql = postgres(url, {
    prepare: false,
    // One connection per instance. The transaction pooler already multiplexes,
    // so a pool inside a serverless function that handles one request at a time
    // buys nothing — and while the client was being rebuilt per query, the
    // default of ten meant ten leaked sockets rather than one.
    max: 1,
    // Given back rather than held forever. An instance scaling down used to
    // occupy its slot until the pooler evicted it, which is how a three-person
    // test session reached a limit of two hundred.
    idle_timeout: 20,
    max_lifetime: 60 * 30,
  });

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
 * Cached on globalThis in every environment. In development that stops a hot
 * reload opening another pool; in production it is the difference between one
 * client per instance and one per query.
 *
 * The cache used to be skipped in production, and `db` below is a Proxy whose
 * every property access lands here — so `db.select(...)` built a whole new
 * postgres client, and so did the next call, each leaking a connection that
 * nothing ever closed. It worked on the first day and degraded with every
 * request until Supabase refused new clients at two hundred, which failed
 * `syncCurrentUser` in the root layout and took every signed-in page down with
 * it. The exception protected against nothing: there is no hot reload in
 * production.
 */
function resolve(): Db {
  const existing = globalThis.__resumiDb;
  if (existing) return existing;
  const created = create();
  globalThis.__resumiDb = created;
  return created;
}

export const db = new Proxy({} as Db, {
  get(_target, property, receiver) {
    return Reflect.get(resolve() as object, property, receiver);
  },
});
