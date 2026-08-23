import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireAdmin } from "@/lib/auth";
import { providerCreateSchema } from "@/lib/schema";
import { createProvider, listProviders, toPublic } from "@/lib/data/providers";
import { PROVIDER_TYPES } from "@/services/sms/sms-provider";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const providers = await listProviders();
  return NextResponse.json({
    success: true,
    providers: providers.map(toPublic),
    providerTypes: PROVIDER_TYPES,
  });
}

export async function POST(req: NextRequest) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;

  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = providerCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  // Validate required fields for the chosen provider type.
  const info = PROVIDER_TYPES[parsed.data.type];
  for (const field of info.fields) {
    if (field.required && !parsed.data[field.key]) {
      return NextResponse.json(
        { success: false, message: `${field.label} is required for ${info.label}.` },
        { status: 400 },
      );
    }
  }

  const provider = await createProvider(parsed.data);
  return NextResponse.json({ success: true, provider: toPublic(provider) }, { status: 201 });
}
