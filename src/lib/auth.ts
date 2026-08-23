import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { query } from "@/lib/db";

export const SESSION_COOKIE = "sms_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24h

export type Role = "SUPER_ADMIN" | "USER";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
}

function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET is not configured");
  }
  return new TextEncoder().encode(secret);
}

// ---------- passwords ----------

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ---------- session tokens ----------

export async function createSessionToken(userId: string, role: Role): Promise<string> {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS)
    .sign(getAuthSecret());
}

export async function verifySessionToken(
  token: string,
): Promise<{ userId: string; role: Role } | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    if (!payload.sub) return null;
    return { userId: payload.sub, role: (payload.role as Role) ?? "USER" };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

// ---------- server-side session resolution (always re-checks the DB) ----------

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await verifySessionToken(token);
  if (!session) return null;

  const { rows } = await query<{
    id: string;
    email: string;
    name: string;
    role: Role;
    is_active: boolean;
  }>(`SELECT id, email, name, role, is_active FROM users WHERE id = $1`, [session.userId]);

  const row = rows[0];
  if (!row || !row.is_active) return null;

  return { id: row.id, email: row.email, name: row.name, role: row.role, isActive: row.is_active };
}

// ---------- API route guards ----------

export async function requireUser(): Promise<
  { user: SessionUser; error?: never } | { user?: never; error: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) {
    return {
      error: NextResponse.json(
        { success: false, message: "Authentication required." },
        { status: 401 },
      ),
    };
  }
  return { user };
}

export async function requireAdmin(): Promise<
  { user: SessionUser; error?: never } | { user?: never; error: NextResponse }
> {
  const result = await requireUser();
  if (result.error) return result;
  if (result.user.role !== "SUPER_ADMIN") {
    return {
      error: NextResponse.json({ success: false, message: "Forbidden." }, { status: 403 }),
    };
  }
  return { user: result.user };
}

/**
 * Basic cross-origin protection for state-changing requests: when an Origin
 * header is present it must match the request host (cookies are SameSite=Lax
 * as the primary defense; this blocks non-GET cross-origin calls).
 */
export function assertSameOrigin(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (host && new URL(origin).host === host) return null;
  } catch {
    // fall through
  }
  return NextResponse.json({ success: false, message: "Invalid request origin." }, { status: 403 });
}
