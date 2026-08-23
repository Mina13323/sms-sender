import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireAdmin } from "@/lib/auth";
import { getProvider, toRuntimeConfig } from "@/lib/data/providers";
import { createProviderAdapter } from "@/services/sms/factory";

export const runtime = "nodejs";

/** POST /api/admin/providers/:id/test — safe configuration test (no SMS sent). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;

  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await ctx.params;
  const provider = await getProvider(id);
  if (!provider) {
    return NextResponse.json({ success: false, message: "Provider not found." }, { status: 404 });
  }

  try {
    const adapter = createProviderAdapter(toRuntimeConfig(provider));
    const health = await adapter.validateConfiguration();
    return NextResponse.json({
      success: true,
      result: health.ok ? "CONNECTED" : "FAILED",
      message: health.message,
    });
  } catch {
    return NextResponse.json({
      success: true,
      result: "FAILED",
      message: "Configuration could not be verified.",
    });
  }
}
