import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, hashPassword, requireAdmin } from "@/lib/auth";
import { userUpdateSchema } from "@/lib/schema";
import {
  countActiveSuperAdmins,
  getUserById,
  updateUser,
  userToPublic,
} from "@/lib/data/users";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;

  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = userUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const target = await getUserById(id);
  if (!target) {
    return NextResponse.json({ success: false, message: "User not found." }, { status: 404 });
  }

  // Safety rails: never lock out the last active super admin.
  const demoting = parsed.data.role === "USER" && target.role === "SUPER_ADMIN";
  const disabling = parsed.data.isActive === false && target.is_active;
  if ((demoting || disabling) && target.role === "SUPER_ADMIN") {
    const others = await countActiveSuperAdmins(target.id);
    if (others === 0) {
      return NextResponse.json(
        { success: false, message: "Cannot disable or demote the last active super admin." },
        { status: 400 },
      );
    }
  }

  const updated = await updateUser(id, {
    name: parsed.data.name,
    role: parsed.data.role,
    isActive: parsed.data.isActive,
    passwordHash: parsed.data.password ? await hashPassword(parsed.data.password) : undefined,
  });

  return NextResponse.json({ success: true, user: updated ? userToPublic(updated) : null });
}
