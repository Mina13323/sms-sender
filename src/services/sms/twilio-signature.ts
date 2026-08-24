import crypto from "node:crypto";

/**
 * Verifies a Twilio webhook request's authenticity.
 *
 * Twilio signs each callback with `X-Twilio-Signature`: an HMAC-SHA256 (keyed
 * by the account's Auth Token, base64-encoded) computed over the request URL
 * (including scheme, host and query string) immediately followed by the POST
 * parameters sorted alphabetically by name, each rendered as name+value (with
 * the value URL-decoded). See:
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 *
 * We reconstruct the exact URL from the forwarded request headers the way a
 * reverse proxy / serverless platform exposes them, then recompute the
 * signature and compare it in constant time.
 */

export interface TwilioSignatureInput {
  /** The exact URL Twilio POSTed to (scheme://host/path?query). */
  url: string;
  /** Raw POST parameters as Twilio sent them (values already URL-decoded). */
  params: Record<string, string>;
  /** The Auth Token of the Twilio account that owns the message. */
  authToken: string;
  /** The signature from the `X-Twilio-Signature` header. */
  signature: string;
}

/** Low-level signature computation (exported for testing). */
export function computeTwilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string,
): string {
  let data = url;
  for (const key of Object.keys(params).sort()) {
    data += key + (params[key] ?? "");
  }
  return crypto.createHmac("sha256", authToken).update(data).digest("base64");
}

export function verifyTwilioSignature(input: TwilioSignatureInput): boolean {
  if (!input.signature || !input.authToken) return false;
  const expected = computeTwilioSignature(input.url, input.params, input.authToken);
  const actual = Buffer.from(input.signature);
  if (actual.length === 0) return false;
  const expectedBuf = Buffer.from(expected);
  if (actual.length !== expectedBuf.length) {
    // Fall back to a constant-time compare of the base64 strings regardless.
    return timingSafeEqualStrings(input.signature, expected);
  }
  return crypto.timingSafeEqual(actual, expectedBuf);
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length || ab.length === 0) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Reconstructs the request URL from forwarded headers, the way Twilio would
 * have seen it behind a reverse proxy / serverless runtime.
 */
export function resolveRequestUrl(headers: Headers, pathname: string, search: string): string {
  const proto = firstHeader(headers, "x-forwarded-proto") ?? "https";
  const host =
    firstHeader(headers, "x-forwarded-host") ?? firstHeader(headers, "host") ?? "localhost";
  return `${proto.split(",")[0].trim()}://${host}${pathname}${search || ""}`;
}

function firstHeader(headers: Headers, name: string): string | undefined {
  return headers.get(name) ?? undefined;
}
