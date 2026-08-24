import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import {
  computeTwilioSignature,
  resolveRequestUrl,
  verifyTwilioSignature,
} from "@/services/sms/twilio-signature";

const URL = "https://sms.example.com/api/sms/status";
const TOKEN = "super-secret-auth-token";

describe("computeTwilioSignature", () => {
  it("matches the documented Twilio algorithm (url + sorted params)", () => {
    const params: Record<string, string> = {
      MessageStatus: "delivered",
      MessageSid: "SM" + "a".repeat(32),
      AccountSid: "AC" + "b".repeat(32),
      To: "+15558675309",
    };
    // Independent reimplementation per the Twilio docs.
    let data = URL;
    for (const key of Object.keys(params).sort()) data += key + params[key];
    const expected = crypto
      .createHmac("sha256", TOKEN)
      .update(data)
      .digest("base64");

    expect(computeTwilioSignature(URL, params, TOKEN)).toBe(expected);
  });

  it("is sensitive to the URL", () => {
    const params = { MessageStatus: "delivered" };
    const a = computeTwilioSignature(URL, params, TOKEN);
    const b = computeTwilioSignature("https://evil.example.com/api/sms/status", params, TOKEN);
    expect(a).not.toBe(b);
  });

  it("is insensitive to parameter insertion order", () => {
    const one = computeTwilioSignature(URL, { MessageStatus: "delivered", ErrorCode: "30007" }, TOKEN);
    const two = computeTwilioSignature(URL, { ErrorCode: "30007", MessageStatus: "delivered" }, TOKEN);
    expect(one).toBe(two);
  });
});

describe("verifyTwilioSignature", () => {
  const params = {
    MessageStatus: "undelivered",
    MessageSid: "SM" + "c".repeat(32),
    AccountSid: "AC" + "d".repeat(32),
    ErrorCode: "21610",
  };

  it("accepts a valid signature", () => {
    const signature = computeTwilioSignature(URL, params, TOKEN);
    expect(
      verifyTwilioSignature({ url: URL, params, authToken: TOKEN, signature }),
    ).toBe(true);
  });

  it("rejects a signature from a different auth token", () => {
    const signature = computeTwilioSignature(URL, params, TOKEN);
    expect(
      verifyTwilioSignature({ url: URL, params, authToken: "wrong-token", signature }),
    ).toBe(false);
  });

  it("rejects a tampered URL", () => {
    const signature = computeTwilioSignature(URL, params, TOKEN);
    expect(
      verifyTwilioSignature({
        url: "https://evil.example.com/api/sms/status",
        params,
        authToken: TOKEN,
        signature,
      }),
    ).toBe(false);
  });

  it("rejects empty signature / token", () => {
    expect(
      verifyTwilioSignature({ url: URL, params, authToken: TOKEN, signature: "" }),
    ).toBe(false);
    expect(
      verifyTwilioSignature({ url: URL, params, authToken: "", signature: "xx" }),
    ).toBe(false);
  });
});

describe("resolveRequestUrl", () => {
  it("prefers forwarded proto/host headers", () => {
    const headers = new Headers({
      "x-forwarded-proto": "https",
      "x-forwarded-host": "sms.example.com",
    });
    expect(resolveRequestUrl(headers, "/api/sms/status", "")).toBe(
      "https://sms.example.com/api/sms/status",
    );
  });

  it("falls back to https + host header and includes the query string", () => {
    const headers = new Headers({ host: "localhost:3000" });
    expect(resolveRequestUrl(headers, "/api/sms/status", "?x=1")).toBe(
      "https://localhost:3000/api/sms/status?x=1",
    );
  });
});
