import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/**
 * Optimistic route protection (Next.js 16 proxy).
 * Full authorization (DB user + isActive + role) is enforced again inside
 * every API route and server layout — this only handles fast redirects.
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (pathname === "/") {
    return NextResponse.redirect(new URL(session ? "/send" : "/login", req.url));
  }

  if (pathname === "/login") {
    if (session) {
      return NextResponse.redirect(new URL("/send", req.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/send") || pathname.startsWith("/admin")) {
    if (!session) {
      const login = new URL("/login", req.url);
      return NextResponse.redirect(login);
    }
    if (pathname.startsWith("/admin") && session.role !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/send", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/send/:path*", "/admin/:path*"],
};
