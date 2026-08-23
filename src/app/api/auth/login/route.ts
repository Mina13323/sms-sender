import { NextRequest, NextResponse } from "next/server";
import { loginSchema } from "@/lib/schema";
import { getUserByEmail } from "@/lib/data/users";
import {
  assertSameOrigin,
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifyPassword,
} from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { hmacKey } from "@/lib/crypto";

export const runtime = "nodejs";

const GENERIC_FAIL = { success: false, message: "Invalid email or password." };

export async function POST(req: NextRequest) {
  try {
    const originError = assertSameOrigin(req);
    if (originError) return originError;

    // Rate limit by client IP (hashed — raw IP is never stored).
    const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
    const ipLimit = await checkRateLimit(`login:ip:${hmacKey(ip)}`, 20, 300);
    if (!ipLimit.allowed) {
      return NextResponse.json(
        { success: false, message: "Too many attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSeconds) } },
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(GENERIC_FAIL, { status: 400 });
    }

    const { email, password } = parsed.data;

    // Per-account rate limit (hashed email as key).
    const acctLimit = await checkRateLimit(`login:acct:${hmacKey(email)}`, 10, 300);
    if (!acctLimit.allowed) {
      return NextResponse.json(
        { success: false, message: "Too many attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(acctLimit.retryAfterSeconds) } },
      );
    }

    const user = await getUserByEmail(email);
    // Constant-shape behavior: verify against a dummy hash when user not found.
    const hash =
      user?.password_hash ??
      "$2b$12$C6UzMDM.H6dfI/f/IKcEeO7ZUbExfbo9tCbcw1sIcbNS7dje/mnbm"; // dummy
    const passwordOk = await verifyPassword(password, hash);

    if (!user || !passwordOk) {
      return NextResponse.json(GENERIC_FAIL, { status: 401 });
    }
    if (!user.is_active) {
      return NextResponse.json(
        { success: false, message: "This account is disabled. Contact your administrator." },
        { status: 403 },
      );
    }

    const token = await createSessionToken(user.id, user.role);
    const res = NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch {
    console.error("Login: unexpected error.");
    return NextResponse.json(
      { success: false, message: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
