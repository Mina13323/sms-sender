import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  listProviders,
  toRuntimeConfig,
  type ProviderRow,
} from "@/lib/data/providers";
import { mapTwilioStatus } from "@/services/sms/providers/twilio-provider";
import {
  resolveRequestUrl,
  verifyTwilioSignature,
} from "@/services/sms/twilio-signature";

export const runtime = "nodejs";

/**
 * POST /api/sms/status — Twilio delivery-status webhook (StatusCallback).
 *
 * Public (no session cookie — Twilio is the caller) but cryptographically
 * verified: the request's X-Twilio-Signature is recomputed with the Auth Token
 * of the Twilio provider whose Account SID matches the callback, and rejected
 * otherwise. Stores ONLY the provider message id, normalized status, error
 * code and the owning user — never the recipient, sender or message body.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) {
    params[k] = v;
  }

  const messageSid = params.MessageSid || params.SmsSid || "";
  if (!messageSid) {
    // Nothing we can correlate on — acknowledge so Twilio stops retrying.
    return new NextResponse(null, { status: 200 });
  }

  const accountSid = params.AccountSid || "";
  const signature = req.headers.get("x-twilio-signature") || "";

  // Find the Twilio provider that owns this account so we can validate the
  // signature with the matching Auth Token.
  const providers = (await listProviders()).filter(
    (p) => p.type === "TWILIO" && p.is_active,
  );

  let authorized = false;
  for (const provider of providers) {
    const cfg = safeRuntimeConfig(provider);
    if (!cfg?.accountSid || cfg.accountSid !== accountSid) continue;
    const url = resolveRequestUrl(req.headers, req.nextUrl.pathname, req.nextUrl.search);
    if (verifyTwilioSignature({ url, params, authToken: cfg.apiSecret ?? "", signature })) {
      authorized = true;
      break;
    }
  }

  if (!authorized) {
    return new NextResponse(null, { status: 403 });
  }

  const status = mapTwilioStatus(params.MessageStatus || params.SmsStatus);
  const errorCode = params.ErrorCode ? Number(params.ErrorCode) : null;

  await query(
    `INSERT INTO sms_deliveries
       (provider_message_id, provider_type, status, error_code)
     VALUES ($1, 'TWILIO', $2, $3)
     ON CONFLICT (provider_message_id) DO UPDATE SET
       status = EXCLUDED.status,
       error_code = COALESCE(EXCLUDED.error_code, sms_deliveries.error_code),
       updated_at = now()`,
    [messageSid, status, Number.isFinite(errorCode as number) ? errorCode : null],
  ).catch(() => undefined);

  // Safe log: counts + status only — never To/From/Body (Twilio sends them).
  console.log(
    `SMS status: sid=${messageSid.slice(0, 6)}… status=${status}${errorCode ? ` code=${errorCode}` : ""}`,
  );

  return new NextResponse(null, { status: 200 });
}

// `toRuntimeConfig` throws when APP_ENCRYPTION_KEY is misconfigured; guard it.
function safeRuntimeConfig(row: ProviderRow) {
  try {
    return toRuntimeConfig(row);
  } catch {
    return null;
  }
}
