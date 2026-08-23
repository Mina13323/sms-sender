import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const [users, providers, routes, usage] = await Promise.all([
    query<{ total: number; active: number }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE is_active)::int AS active
         FROM users`,
    ),
    query<{ total: number; active: number }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE is_active)::int AS active
         FROM providers`,
    ),
    query<{ total: number; active: number }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE is_active)::int AS active
         FROM sms_routes`,
    ),
    query<{ messages: number; segments: number; failed: number }>(
      `SELECT COALESCE(SUM(messages), 0)::int AS messages,
              COALESCE(SUM(segments), 0)::int AS segments,
              COALESCE(SUM(failed), 0)::int AS failed
         FROM usage_counters
        WHERE day >= CURRENT_DATE - INTERVAL '30 days'`,
    ),
  ]);

  return NextResponse.json({
    success: true,
    stats: {
      users: users.rows[0],
      providers: providers.rows[0],
      routes: routes.rows[0],
      usageLast30Days: usage.rows[0],
    },
  });
}
