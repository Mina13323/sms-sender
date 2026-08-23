import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireAdmin } from "@/lib/auth";
import { providerUpdateSchema } from "@/lib/schema";
import { deleteProvider, getProvider, toPublic, updateProvider } from "@/lib/data/providers";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;

  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = providerUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const updated = await updateProvider(id, parsed.data);
  if (!updated) {
    return NextResponse.json({ success: false, message: "Provider not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true, provider: toPublic(updated) });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;

  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await ctx.params;
  const existing = await getProvider(id);
  if (!existing) {
    return NextResponse.json({ success: false, message: "Provider not found." }, { status: 404 });
  }
  await deleteProvider(id);
  return NextResponse.json({ success: true });
}
