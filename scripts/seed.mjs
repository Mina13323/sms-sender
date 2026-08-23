/**
 * Seeds the initial Super Admin account (and a Mock provider for development).
 *
 * Reads ADMIN_EMAIL / ADMIN_PASSWORD from the environment.
 * Safe to run repeatedly: it never overwrites an existing user.
 *
 *   node scripts/seed.mjs                 # seed admin + mock provider
 *   SEED_EXAMPLE_ROUTES=1 node scripts/seed.mjs   # also seed example routes
 */
import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';
if (!email || password.length < 10) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (min 10 chars) in the environment before seeding.');
  process.exit(1);
}

const isLocal = /localhost|127\.0\.0\.1/.test(url);
const client = new pg.Client({
  connectionString: url,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

try {
  await client.connect();

  const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rowCount > 0) {
    console.log('[seed] admin user already exists, skipping.');
  } else {
    const hash = await bcrypt.hash(password, 12);
    await client.query(
      `INSERT INTO users (email, name, password_hash, role, is_active)
       VALUES ($1, $2, $3, 'SUPER_ADMIN', TRUE)`,
      [email, 'Super Admin', hash],
    );
    console.log('[seed] created SUPER_ADMIN user.');
  }

  // A mock provider is useful for development / staging. It is NOT meant for
  // production use; configure a real provider (e.g. Twilio) in the admin UI.
  const mock = await client.query(`SELECT id FROM providers WHERE type = 'MOCK' LIMIT 1`);
  if (mock.rowCount === 0) {
    await client.query(
      `INSERT INTO providers (name, type, is_active, is_default, priority, sender_id)
       VALUES ('Mock (development only)', 'MOCK', TRUE, TRUE, 900, 'DEV-TEST')`,
    );
    console.log('[seed] created Mock provider (development only).');
  }

  if (process.env.SEED_EXAMPLE_ROUTES === '1') {
    const { rows } = await client.query(`SELECT id FROM providers ORDER BY priority ASC LIMIT 1`);
    const providerId = rows[0]?.id;
    const count = await client.query('SELECT COUNT(*)::int AS n FROM sms_routes');
    if (providerId && count.rows[0].n === 0) {
      const routes = [
        ['Bolivia', '+591', 'Viva', 0.004],
        ['Indonesia', '+62', 'Smart', 0.004],
        ['Senegal', '+221', 'Tigo', 0.004],
        ['Senegal', '+221', 'Expresso', 0.004],
        ['Burundi', '+257', 'Econet', 0.004],
        ['Armenia', '+374', 'Ucom', 0.004],
      ];
      for (const [country, code, carrier, price] of routes) {
        await client.query(
          `INSERT INTO sms_routes (country, country_code, carrier, provider_id, price_per_segment, currency, priority, is_active)
           VALUES ($1, $2, $3, $4, $5, 'USD', 100, TRUE)`,
          [country, code, carrier, providerId, price],
        );
      }
      console.log('[seed] created example routes (edit prices in /admin/routes).');
    }
  }

  console.log('[seed] done.');
} catch (err) {
  console.error('[seed] failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
