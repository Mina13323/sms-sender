import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireUser } from "@/lib/auth";
import { sendSmsSchema } from "@/lib/schema";
import { parseRecipients } from "@/lib/phone";
import { checkRateLimit, isDuplicate } from "@/lib/rate-limit";
import { hmacKey } from "@/lib/crypto";
import { getSettings } from "@/lib/settings";
import { resolveSendingContext, sendBatch } from "@/services/sms/send-service";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 64 * 1024;

/**
 * POST /api/sms/send
 * Auth required. Rate limited. Validates and normalizes recipients, resolves
 * the provider through the abstraction layer and returns per-recipient results.
 * NOTHING about the message (recipients/body) is persisted or logged.
 */
export async function POST(req: NextRequest) {
  try {
    const originError = assertSameOrigin(req);
    if (originError) return originError;

    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return NextResponse.json(
        { success: false, message: "Request is too large." },
        { status: 413 },
      );
    }

    const auth = await requireUser();
    if (auth.error) return auth.error; // 401 also covers disabled users (getSessionUser re-checks DB)
    const user = auth.user;

    const settings = await getSettings();

    // Per-user rate limit
    const rate = await checkRateLimit(`sms:${user.id}`, settings.smsRatePerMinute, 60);
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, message: "Rate limit reached. Please wait a moment and try again." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } },
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = sendSmsSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { success: false, message: first?.message ?? "Invalid input." },
        { status: 400 },
      );
    }

    const { recipients: rawRecipients, message, routeId } = parsed.data;

    const { valid, invalid } = parseRecipients(rawRecipients, settings.smsMaxRecipients);
    if (invalid.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Invalid phone number(s): ${invalid.slice(0, 3).join(", ")}${invalid.length > 3 ? "…" : ""}. Use international format, e.g. +221771234567.`,
        },
        { status: 400 },
      );
    }
    if (valid.length === 0) {
      return NextResponse.json(
        { success: false, message: "Enter at least one valid recipient." },
        { status: 400 },
      );
    }
    if (valid.length > settings.smsMaxRecipients) {
      return NextResponse.json(
        {
          success: false,
          message: `Too many recipients. Maximum is ${settings.smsMaxRecipients} per request.`,
        },
        { status: 400 },
      );
    }

    // Duplicate-send guard (30s window). Only an HMAC fingerprint is stored.
    const fingerprint = hmacKey(`${user.id}|${valid.join(",")}|${message}`);
    if (await isDuplicate(fingerprint, 30)) {
      return NextResponse.json(
        { success: false, message: "This exact message was just sent. Please wait a moment." },
        { status: 409 },
      );
    }

    const { context, error } = await resolveSendingContext(routeId ?? undefined);
    if (!context) {
      const msg =
        error === "no_active_provider"
          ? "No active SMS provider is configured. Contact your administrator."
          : "The selected route is not available.";
      return NextResponse.json({ success: false, message: msg }, { status: 400 });
    }

    const batch = await sendBatch(context, valid, message, user.id);

    // Safe log: counts only — never recipients or bodies.
    console.log(
      `SMS send: user=${user.id} provider=${context.provider.type} ok=${batch.sentCount} failed=${batch.failedCount}`,
    );

    if (batch.sentCount === 0) {
      return NextResponse.json(
        { success: false, message: "Unable to send SMS. Please try again.", results: batch.results },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      message:
        batch.failedCount === 0
          ? "SMS submitted successfully."
          : `Submitted ${batch.sentCount} of ${batch.results.length} messages.`,
      results: batch.results,
      segmentsPerMessage: batch.segmentsPerMessage,
    });
  } catch {
    console.error("SMS send: unexpected error.");
    return NextResponse.json(
      { success: false, message: "Unable to send SMS. Please try again." },
      { status: 500 },
    );
  }
}
