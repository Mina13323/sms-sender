import { Pool } from "pg";

/**
 * PostgreSQL connection pool (works with Supabase in production and the
 * embedded local database in development).
 *
 * Serverless-friendly: small pool, cached on globalThis so hot reloads and
 * warm lambda invocations reuse connections.
 */

declare global {
  var __smsPanelPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }
  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  return new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  });
}

export function getPool(): Pool {
  if (!globalThis.__smsPanelPool) {
    globalThis.__smsPanelPool = createPool();
  }
  return globalThis.__smsPanelPool;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function query<T = any>(
  text: string,
  params: unknown[] = [],
): Promise<{ rows: T[]; rowCount: number }> {
  const res = await getPool().query(text, params);
  return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
}
