/**
 * Applies db/schema.sql to DATABASE_URL. Idempotent (CREATE ... IF NOT EXISTS).
 * Works against any PostgreSQL: Supabase (production) or the local dev database.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const isLocal = /localhost|127\.0\.0\.1/.test(url);
const client = new pg.Client({
  connectionString: url,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

const sql = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');

try {
  await client.connect();
  await client.query(sql);
  console.log('[migrate] schema applied successfully.');
} catch (err) {
  console.error('[migrate] failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
