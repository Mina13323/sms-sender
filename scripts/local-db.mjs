/**
 * Local development database bootstrapper.
 *
 * Starts an embedded PostgreSQL server (dev-only dependency) so the app can be
 * developed and tested without any external services. Production uses a hosted
 * PostgreSQL via DATABASE_URL (Neon / Supabase / Prisma Postgres / RDS, ...).
 */
import EmbeddedPostgres from 'embedded-postgres';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve('.cache/pgdata');
const port = Number(process.env.LOCAL_PG_PORT || 5433);
const firstRun = !existsSync(path.join(dataDir, 'PG_VERSION'));

mkdirSync(dataDir, { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'sms',
  password: 'sms',
  port,
  persistent: true,
});

if (firstRun) {
  await pg.initialise();
}
await pg.start();
if (firstRun) {
  await pg.createDatabase('sms_panel');
}
console.log(`[local-db] PostgreSQL ready on port ${port} (db: sms_panel)`);
console.log(`[local-db] DATABASE_URL=postgresql://sms:sms@localhost:${port}/sms_panel`);

const shutdown = async () => {
  try {
    await pg.stop();
  } finally {
    process.exit(0);
  }
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
// keep process alive
setInterval(() => {}, 1 << 30);
