import { describe, expect, it, vi, afterEach } from "vitest";
import {
  describeVonageErrorCode,
  normalizeVonageBaseUrl,
  VonageProvider,
} from "@/services/sms/providers/vonage-provider";
import type { ProviderRuntimeConfig } from "@/services/sms/sms-provider";

afterEach(() => vi.unstubAllGlobals());

function mockJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const cfg: ProviderRuntimeConfig = {
  type: "VONAGE",
  apiKey: "k",
  apiSecret: "s",
  senderId: "Vonage",
};

describe("describeVonageErrorCode", () => {
  it("explains invalid credentials", () => {
    const hint = describeVonageErrorCode(4);
    expect(hint?.title).toContain("Invalid credentials");
    expect(hint?.title).toContain("vonage_4");
    expect(hint?.hint).toMatch(/API key/i);
  });

  it("explains quota / balance exceeded", () => {
    expect(describeVonageErrorCode("9")?.title).toMatch(/quota/i);
  });

  it("explains invalid sender", () => {
    expect(describeVonageErrorCode(15)?.title).toContain("Invalid sender");
  });

  it("returns null for unknown / missing codes", () => {
    expect(describeVonageErrorCode(9999)).toBeNull();
    expect(describeVonageErrorCode(undefined)).toBeNull();
    expect(describeVonageErrorCode("nope")).toBeNull();
  });
});

describe("normalizeVonageBaseUrl", () => {
  it("defaults to the REST host when empty", () => {
    expect(normalizeVonageBaseUrl(undefined)).toBe("https://rest.nexmo.com");
    expect(normalizeVonageBaseUrl("   ")).toBe("https://rest.nexmo.com");
  });

  it("strips trailing slashes", () => {
    expect(normalizeVonageBaseUrl("https://rest.nexmo.com///")).toBe("https://rest.nexmo.com");
  });
});

describe("VonageProvider.sendSms", () => {
  it("reports success when Vonage returns status 0 over HTTP 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        mockJson({
          "message-count": "1",
          messages: [{ status: "0", "message-id": "0A0000000123ABCD1" }],
        }),
      ),
    );
    const r = await new VonageProvider(cfg).sendSms({ to: "+20120000000", body: "hi" });
    expect(r.success).toBe(true);
    expect(r.providerMessageId).toBe("0A0000000123ABCD1");
    expect(r.status).toBe("submitted");
  });

  it("reports FAILURE when Vonage returns a non-zero status over HTTP 200", async () => {
    // This is the bug a generic HTTP provider would get wrong (treat 200 as success).
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        mockJson({
          "message-count": "1",
          messages: [{ status: "9", "error-text": "quota" }],
        }),
      ),
    );
    const r = await new VonageProvider(cfg).sendSms({ to: "+20120000000", body: "hi" });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe("vonage_9");
  });

  it("never echoes error-text in the result (PII-safe)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        mockJson({ messages: [{ status: "4", "error-text": "SECRET-TO" }] }),
      ),
    );
    const r = await new VonageProvider(cfg).sendSms({ to: "+20120000000", body: "hi" });
    expect(JSON.stringify(r)).not.toContain("SECRET-TO");
  });

  it("fails when not configured (missing key/secret)", async () => {
    const r = await new VonageProvider({ type: "VONAGE" }).sendSms({
      to: "+20120000000",
      body: "hi",
    });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe("provider_not_configured");
  });

  it("fails on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("boom"); }));
    const r = await new VonageProvider(cfg).sendSms({ to: "+20120000000", body: "hi" });
    expect(r.success).toBe(false);
    expect(r.errorCode).toBe("network_error");
  });
});

describe("VonageProvider.validateConfiguration", () => {
  it("reports connected with balance on valid credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockJson({ value: 10.5, autoReload: false })),
    );
    const res = await new VonageProvider(cfg).validateConfiguration();
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/balance/i);
  });

  it("reports auth failure on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => mockJson({ "status-code": 401 }, 401)),
    );
    const res = await new VonageProvider(cfg).validateConfiguration();
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/auth/i);
  });

  it("flags missing credentials without calling the API", async () => {
    const res = await new VonageProvider({ type: "VONAGE" }).validateConfiguration();
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/API key/i);
  });
});
