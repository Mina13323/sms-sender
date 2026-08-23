import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireAdmin } from "@/lib/auth";
import { routeUpdateSchema } from "@/lib/schema";
import { deleteRoute, getRoute, routeToPublic, updateRoute } from "@/lib/data/routes";
import { getProvider } from "@/lib/data/providers";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;

  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = routeUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  if (parsed.data.providerId) {
    const provider = await getProvider(parsed.data.providerId);
    if (!provider) {
      return NextResponse.json(
        { success: false, message: "Selected provider does not exist." },
        { status: 400 },
      );
    }
  }

  const updated = await updateRoute(id, parsed.data);
  if (!updated) {
    return NextResponse.json({ success: false, message: "Route not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true, route: routeToPublic(updated) });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;

  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await ctx.params;
  const existing = await getRoute(id);
  if (!existing) {
    return NextResponse.json({ success: false, message: "Route not found." }, { status: 404 });
  }
  await deleteRoute(id);
  return NextResponse.json({ success: true });
}
