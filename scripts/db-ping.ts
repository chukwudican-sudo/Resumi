/**
 * Checks that DATABASE_URL actually reaches a database, and reports what is in it.
 *
 *   npx tsx scripts/db-ping.ts
 *
 * Worth having as its own script: a connection string can be wrong in several
 * quiet ways — an unsubstituted password placeholder, the direct port instead
 * of the pooler, a project that is still provisioning — and each of those
 * otherwise surfaces much later as a confusing failure inside something else.
 */
import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set. Run with: export $(grep -v "^#" .env.local | xargs)');
    process.exit(1);
  }

  if (url.includes('[') || url.includes('YOUR-PASSWORD')) {
    console.error('DATABASE_URL still contains a placeholder — the password was never substituted.');
    process.exit(1);
  }
  if (!url.includes(':6543')) {
    console.warn('Warning: not port 6543. The transaction pooler is what this app expects.');
  }

  const sql = postgres(url, { prepare: false });
  try {
    const [info] = await sql`select current_database() as db, current_user as usr`;
    console.log(`connected — database "${info.db}" as "${info.usr}"`);

    const tables = await sql<{ tablename: string }[]>`
      select tablename from pg_tables where schemaname = 'public' order by tablename
    `;
    if (tables.length === 0) {
      console.log('public schema is empty — no migration has run yet');
    } else {
      console.log(`${tables.length} tables: ${tables.map((t) => t.tablename).join(', ')}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error('FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
