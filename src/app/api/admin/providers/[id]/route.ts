import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireAdmin } from "@/lib/auth";
import { providerUpdateSchema } from "@/lib/schema";
import { deleteProvider, getProvider, toPublic, updateProvider } from "@/lib/data/providers";
import { validateOutboundUrl } from "@/lib/ssrf";
import { toErrorResponse } from "@/lib/server-errors";


export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
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

    const target = await getProvider(id);
    if (!target) {
      return NextResponse.json({ success: false, message: "Provider not found." }, { status: 404 });
    }

    // SSRF policy re-checked whenever the endpoint changes on an HTTP provider.
    if (target.type === "HTTP" && parsed.data.apiBaseUrl) {
      const urlCheck = validateOutboundUrl(parsed.data.apiBaseUrl);
      if (!urlCheck.ok) {
        return NextResponse.json(
          { success: false, message: `Endpoint rejected: ${urlCheck.reason}` },
          { status: 400 },
        );
      }
    }

    const updated = await updateProvider(id, parsed.data);

    if (!updated) {
      return NextResponse.json({ success: false, message: "Provider not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true, provider: toPublic(updated) });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
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
  } catch (err) {
    return toErrorResponse(err);
  }
}
