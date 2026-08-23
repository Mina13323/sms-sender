import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GenericHttpProvider,
  normalizeHttpStatus,
} from "@/services/sms/providers/http-provider";
import { ProviderRuntimeConfig, GenericHttpConfig } from "@/services/sms/sms-provider";

// Public IP literal endpoint → passes SSRF checks without DNS/network.
const ENDPOINT = "https://8.8.8.8/v1/messages";

function makeConfig(
  http: Partial<GenericHttpConfig>,
  secrets: Partial<ProviderRuntimeConfig> = {},
): ProviderRuntimeConfig {
  return {
    type: "HTTP",
    apiBaseUrl: ENDPOINT,
    senderId: "MyBrand",
    apiKey: "sk-key-123",
    apiSecret: "sec-456",
    accountSid: "user-789",
    ...secrets,
    http: {
      method: "POST",
      authType: "NONE",
      contentType: "application/json",
      ...http,
    },
  };
}

function mockFetchOnce(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue(
    new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const INPUT = { to: "+221771234567", body: "Hello there" };

describe("GenericHttpProvider.buildRequest", () => {
  it("renders custom JSON body with provider-specific field names", () => {
    const provider = new GenericHttpProvider(
      makeConfig({
        bodyTemplate: '{"recipient":"{{to}}","text":"{{message}}","originator":"{{sender}}"}',
      }),
    );
    const req = provider.buildRequest(INPUT);
    const body = JSON.parse(req.body!);
    expect(body).toEqual({ recipient: "+221771234567", text: "Hello there", originator: "MyBrand" });
    expect(req.headers["Content-Type"]).toBe("application/json");
    expect(req.method).toBe("POST");
  });

  it("applies Bearer authentication", () => {
    const provider = new GenericHttpProvider(
      makeConfig({ authType: "BEARER", bodyTemplate: "{}" }),
    );
    expect(provider.buildRequest(INPUT).headers["Authorization"]).toBe("Bearer sk-key-123");
  });

  it("applies API key header authentication", () => {
    const provider = new GenericHttpProvider(
      makeConfig({ authType: "API_KEY_HEADER", authName: "X-API-Key", bodyTemplate: "{}" }),
    );
    expect(provider.buildRequest(INPUT).headers["X-API-Key"]).toBe("sk-key-123");
  });

  it("applies API key query authentication", () => {
    const provider = new GenericHttpProvider(
      makeConfig({ authType: "API_KEY_QUERY", authName: "api_key", bodyTemplate: "{}" }),
    );
    expect(provider.buildRequest(INPUT).url).toContain("api_key=sk-key-123");
  });

  it("applies Basic authentication from username+password", () => {
    const provider = new GenericHttpProvider(makeConfig({ authType: "BASIC", bodyTemplate: "{}" }));
    const expected = "Basic " + Buffer.from("user-789:sec-456").toString("base64");
    expect(provider.buildRequest(INPUT).headers["Authorization"]).toBe(expected);
  });

  it("applies custom header auth with template", () => {
    const provider = new GenericHttpProvider(
      makeConfig({
        authType: "CUSTOM_HEADER",
        authName: "X-Auth",
        authValueTemplate: "Token {{apiKey}}",
        bodyTemplate: "{}",
      }),
    );
    expect(provider.buildRequest(INPUT).headers["X-Auth"]).toBe("Token sk-key-123");
  });

  it("renders custom headers and query params with variables", () => {
    const provider = new GenericHttpProvider(
      makeConfig({
        headers: { "X-Sender": "{{from}}" },
        queryParams: { to: "{{to}}" },
        bodyTemplate: "{}",
      }),
    );
    const req = provider.buildRequest(INPUT);
    expect(req.headers["X-Sender"]).toBe("MyBrand");
    expect(req.url).toContain("to=%2B221771234567");
  });

  it("builds GET requests without a body", () => {
    const provider = new GenericHttpProvider(
      makeConfig({ method: "GET", queryParams: { to: "{{to}}", text: "{{message}}" } }),
    );
    const req = provider.buildRequest(INPUT);
    expect(req.method).toBe("GET");
    expect(req.body).toBeUndefined();
    expect(req.url).toContain("text=Hello+there");
  });

  it("form-encodes urlencoded bodies", () => {
    const provider = new GenericHttpProvider(
      makeConfig({
        contentType: "application/x-www-form-urlencoded",
        bodyTemplate: "to={{to}}&text={{message}}",
      }),
    );
    const req = provider.buildRequest(INPUT);
    expect(req.body).toBe("to=%2B221771234567&text=Hello%20there");
    expect(req.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
  });
});

describe("GenericHttpProvider.sendSms", () => {
  it("maps response fields via JSONPath config", async () => {
    mockFetchOnce(200, { data: { id: "xyz", state: "sent" } });
    const provider = new GenericHttpProvider(
      makeConfig({
        bodyTemplate: '{"to":"{{to}}"}',
        messageIdPath: "$.data.id",
        statusPath: "$.data.state",
      }),
    );
    const result = await provider.sendSms(INPUT);
    expect(result.success).toBe(true);
    expect(result.providerMessageId).toBe("xyz");
    expect(result.status).toBe("sent");
  });

  it("treats configured success codes as success", async () => {
    mockFetchOnce(202, { id: "1" });
    const provider = new GenericHttpProvider(
      makeConfig({ bodyTemplate: "{}", successCodes: [202], messageIdPath: "$.id" }),
    );
    const result = await provider.sendSms(INPUT);
    expect(result.success).toBe(true);
    expect(result.providerMessageId).toBe("1");
  });

  it("fails safely on provider error responses (no raw response leak)", async () => {
    mockFetchOnce(401, { error: "bad key", secret_hint: "sk-key-123" });
    const provider = new GenericHttpProvider(makeConfig({ bodyTemplate: "{}" }));
    const result = await provider.sendSms(INPUT);
    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBe("http_401");
    expect(JSON.stringify(result)).not.toContain("sk-key-123");
    expect(JSON.stringify(result)).not.toContain("bad key");
  });

  it("fails with timeout code when the request aborts", async () => {
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));
    const provider = new GenericHttpProvider(makeConfig({ bodyTemplate: "{}", timeoutMs: 1000 }));
    const result = await provider.sendSms(INPUT);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("timeout");
  });

  it("blocks SSRF targets at send time", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const provider = new GenericHttpProvider(
      makeConfig({ bodyTemplate: "{}" }, { apiBaseUrl: "https://169.254.169.254/latest" }),
    );
    const result = await provider.sendSms(INPUT);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("blocked_url");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails when not configured", async () => {
    const provider = new GenericHttpProvider({ type: "HTTP" });
    const result = await provider.sendSms(INPUT);
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("provider_not_configured");
  });
});

describe("normalizeHttpStatus", () => {
  it("never claims delivery for unknown statuses", () => {
    expect(normalizeHttpStatus(undefined)).toBe("submitted");
    expect(normalizeHttpStatus("queued")).toBe("submitted");
    expect(normalizeHttpStatus("ok")).toBe("submitted");
  });
  it("maps common vocabulary conservatively", () => {
    expect(normalizeHttpStatus("DELIVERED")).toBe("delivered");
    expect(normalizeHttpStatus("undelivered")).toBe("undelivered");
    expect(normalizeHttpStatus("sent")).toBe("sent");
    expect(normalizeHttpStatus("failed")).toBe("failed");
    expect(normalizeHttpStatus("error")).toBe("failed");
  });
});
