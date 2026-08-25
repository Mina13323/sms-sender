import { NextResponse } from "next/server";

/**
 * Turns a thrown server-side error into a safe JSON response.
 *
 * Why this exists: several admin routes encrypt/decrypt provider credentials
 * or hit the database. When something is misconfigured (e.g. APP_ENCRYPTION_KEY
 * not set, schema not migrated) those calls throw, and without a handler the
 * route dies as a 500 with an EMPTY body — leaving the admin with no clue what
 * to fix. This logs the real error server-side (for the operator) and returns a
 * non-sensitive, actionable message to the client.
 */
export function describeServerError(err: unknown): { status: number; message: string } {
  const raw =
    err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  // Always log the real cause for the operator — never the client.
  console.error("[server] error:", raw);

  if (/APP_ENCRYPTION_KEY/i.test(raw)) {
    return {
      status: 500,
      message:
        "Server encryption key (APP_ENCRYPTION_KEY) is not configured. Set a 32-byte base64 value in the environment and redeploy.",
    };
  }
  if (/relation "\w+" does not exist|column "\w+" does not exist/i.test(raw)) {
    return {
      status: 500,
      message:
        "The database schema is not applied yet. Run the migration (pnpm db:migrate) against DATABASE_URL and redeploy if needed.",
    };
  }
  if (/DATABASE_URL/i.test(raw)) {
    return {
      status: 500,
      message: "The database connection is not configured (DATABASE_URL).",
    };
  }
  if (/AUTH_SECRET/i.test(raw)) {
    return { status: 500, message: "AUTH_SECRET is not configured." };
  }
  return { status: 500, message: "Something went wrong on the server. Please try again." };
}

/** Convenience wrapper that returns the NextResponse directly. */
export function toErrorResponse(err: unknown): NextResponse {
  const { status, message } = describeServerError(err);
  return NextResponse.json({ success: false, message }, { status });
}
