import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireAdmin } from "@/lib/auth";
import { settingsSchema } from "@/lib/schema";
import { getSettings, setSetting, SETTING_KEYS } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const settings = await getSettings();
  return NextResponse.json({ success: true, settings });
}

export async function PATCH(req: NextRequest) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;

  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  if (parsed.data.smsRatePerMinute !== undefined) {
    await setSetting(SETTING_KEYS.smsRatePerMinute, String(parsed.data.smsRatePerMinute));
  }
  if (parsed.data.smsMaxRecipients !== undefined) {
    await setSetting(SETTING_KEYS.smsMaxRecipients, String(parsed.data.smsMaxRecipients));
  }

  const settings = await getSettings();
  return NextResponse.json({ success: true, settings });
}
