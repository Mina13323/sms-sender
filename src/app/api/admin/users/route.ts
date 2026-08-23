import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, hashPassword, requireAdmin } from "@/lib/auth";
import { userCreateSchema } from "@/lib/schema";
import { createUser, getUserByEmail, listUsers, userToPublic } from "@/lib/data/users";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const users = await listUsers();
  return NextResponse.json({ success: true, users: users.map(userToPublic) });
}

export async function POST(req: NextRequest) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;

  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = userCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const existing = await getUserByEmail(parsed.data.email);
  if (existing) {
    return NextResponse.json(
      { success: false, message: "A user with this email already exists." },
      { status: 409 },
    );
  }

  const user = await createUser({
    email: parsed.data.email,
    name: parsed.data.name,
    passwordHash: await hashPassword(parsed.data.password),
    role: parsed.data.role,
  });
  return NextResponse.json({ success: true, user: userToPublic(user) }, { status: 201 });
}
