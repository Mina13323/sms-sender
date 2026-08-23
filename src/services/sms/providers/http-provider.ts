import {
  GenericHttpConfig,
  ProviderHealthResult,
  ProviderRuntimeConfig,
  SendSmsInput,
  SendSmsResult,
  SmsMessageStatus,
  SmsProvider,
} from "../sms-provider";
import { renderTemplate, getJsonPath, TemplateVars, TemplateMode } from "../template";
import { safeFetch, validateOutboundUrl, validateOutboundUrlWithDns } from "@/lib/ssrf";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_SUCCESS_CODES = [200, 201, 202];

/** Maps arbitrary provider status strings to our normalized statuses (conservative). */
export function normalizeHttpStatus(raw: unknown): SmsMessageStatus {
  const value = String(raw ?? "").toLowerCase();
  if (!value) return "submitted";
  if (value.includes("undeliver") || value.includes("reject") || value.includes("expired"))
    return "undelivered";
  if (value.includes("deliver")) return "delivered";

  if (value.includes("fail") || value.includes("error") || value.includes("invalid"))
    return "failed";
  if (value.includes("sent") || value.includes("sending")) return "sent";
  // queued / accepted / pending / ok / anything unknown → submitted (never claim delivery)
  return "submitted";
}

/**
 * Generic HTTP/REST SMS provider.
 *
 * Fully database-configured: endpoint, method, authentication, headers,
 * query params, request body template and response mapping all come from the
 * admin-managed provider record. Adding a new provider of this kind requires
 * ZERO code changes.
 *
 * Security: all requests go through safeFetch (SSRF validation, timeout,
 * no redirects, response size cap). Templates are data-only substitution.
 */
export class GenericHttpProvider implements SmsProvider {
  private readonly endpoint: string;
  private readonly cfg: GenericHttpConfig;
  private readonly secrets: TemplateVars;
  private readonly from?: string;

  constructor(config: ProviderRuntimeConfig) {
    this.endpoint = config.apiBaseUrl ?? "";
    this.cfg = {
      method: config.http?.method ?? "POST",
      authType: config.http?.authType ?? "NONE",
      authName: config.http?.authName,
      authValueTemplate: config.http?.authValueTemplate,
      contentType: config.http?.contentType ?? "application/json",
      headers: config.http?.headers ?? {},
      queryParams: config.http?.queryParams ?? {},
      bodyTemplate: config.http?.bodyTemplate,
      timeoutMs: config.http?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      successCodes: config.http?.successCodes?.length
        ? config.http.successCodes
        : DEFAULT_SUCCESS_CODES,
      messageIdPath: config.http?.messageIdPath,
      statusPath: config.http?.statusPath,
    };
    this.from = config.senderId;
    this.secrets = {
      apiKey: config.apiKey,
      apiSecret: config.apiSecret,
      password: config.apiSecret,
      username: config.accountSid,
    };
  }

  private buildVars(input?: SendSmsInput): TemplateVars {
    const from = input?.from || this.from || "";
    return {
      ...this.secrets,
      to: input?.to ?? "",
      message: input?.body ?? "",
      from,
      sender: from,
      country: "",
    };
  }

  /** Builds URL, headers and body for a request. Throws on invalid config. */
  buildRequest(input?: SendSmsInput): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
  } {
    if (!this.endpoint) throw new Error("missing_endpoint");
    const vars = this.buildVars(input);

    const url = new URL(this.endpoint);
    for (const [key, valueTemplate] of Object.entries(this.cfg.queryParams ?? {})) {
      url.searchParams.set(key, renderTemplate(valueTemplate, vars, "raw"));
    }

    const headers: Record<string, string> = {};
    for (const [name, valueTemplate] of Object.entries(this.cfg.headers ?? {})) {
      headers[name] = renderTemplate(valueTemplate, vars, "raw");
    }

    switch (this.cfg.authType) {
      case "BEARER":
        headers["Authorization"] = `Bearer ${this.secrets.apiKey ?? ""}`;
        break;
      case "BASIC": {
        const user = this.secrets.username ?? "";
        const pass = this.secrets.apiSecret ?? "";
        headers["Authorization"] = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
        break;
      }
      case "API_KEY_HEADER":
        headers[this.cfg.authName || "X-API-Key"] = this.secrets.apiKey ?? "";
        break;
      case "API_KEY_QUERY":
        url.searchParams.set(this.cfg.authName || "api_key", this.secrets.apiKey ?? "");
        break;
      case "CUSTOM_HEADER":
        if (this.cfg.authName) {
          headers[this.cfg.authName] = renderTemplate(
            this.cfg.authValueTemplate ?? "{{apiKey}}",
            vars,
            "raw",
          );
        }
        break;
      case "NONE":
      default:
        break;
    }

    let body: string | undefined;
    if (this.cfg.method === "POST") {
      headers["Content-Type"] = this.cfg.contentType;
      const mode: TemplateMode =
        this.cfg.contentType === "application/json" ? "json" : "form";
      body = renderTemplate(this.cfg.bodyTemplate ?? "", vars, mode);
    }

    return { url: url.toString(), method: this.cfg.method, headers, body };
  }

  async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
    let request: ReturnType<GenericHttpProvider["buildRequest"]>;
    try {
      request = this.buildRequest(input);
    } catch {
      return { success: false, status: "failed", errorCode: "provider_not_configured" };
    }

    const result = await safeFetch(
      request.url,
      { method: request.method, headers: request.headers, body: request.body },
      this.cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    if (!result.ok) {
      // Safe log: error code only — never URLs with params, bodies or headers.
      console.error(`GenericHttpProvider: request failed (${result.errorCode ?? "unknown"})`);
      return { success: false, status: "failed", errorCode: result.errorCode ?? "network_error" };
    }

    const success = (this.cfg.successCodes ?? DEFAULT_SUCCESS_CODES).includes(result.status ?? 0);
    let parsed: unknown = undefined;
    try {
      parsed = result.bodyText ? JSON.parse(result.bodyText) : undefined;
    } catch {
      parsed = undefined;
    }

    if (!success) {
      console.error(`GenericHttpProvider: provider rejected request (http ${result.status})`);
      return { success: false, status: "failed", errorCode: `http_${result.status}` };
    }

    const messageId = this.cfg.messageIdPath
      ? getJsonPath(parsed, this.cfg.messageIdPath)
      : undefined;
    const rawStatus = this.cfg.statusPath ? getJsonPath(parsed, this.cfg.statusPath) : undefined;

    return {
      success: true,
      providerMessageId: messageId !== undefined && messageId !== null ? String(messageId) : undefined,
      status: normalizeHttpStatus(rawStatus),
    };
  }

  /**
   * Safe configuration test — does NOT send an SMS. Validates configuration,
   * SSRF rules, DNS resolution and TCP/TLS reachability of the endpoint.
   */
  async validateConfiguration(): Promise<ProviderHealthResult> {
    if (!this.endpoint) {
      return { ok: false, message: "Endpoint URL is not configured." };
    }
    const staticCheck = validateOutboundUrl(this.endpoint);
    if (!staticCheck.ok) {
      return { ok: false, message: `Endpoint rejected: ${staticCheck.reason}` };
    }
    try {
      this.buildRequest({ to: "+10000000000", body: "test", from: this.from });
    } catch {
      return { ok: false, message: "Request template could not be constructed." };
    }
    if (this.cfg.method === "POST" && !this.cfg.bodyTemplate) {
      return { ok: false, message: "POST providers need a request body template." };
    }

    const dnsCheck = await validateOutboundUrlWithDns(this.endpoint);
    if (!dnsCheck.ok) {
      return { ok: false, message: `Endpoint rejected: ${dnsCheck.reason}` };
    }

    // Reachability probe without sending an SMS: OPTIONS request.
    const probe = await safeFetch(
      this.endpoint,
      { method: "OPTIONS", headers: {} },
      Math.min(this.cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS, 10_000),
    );
    if (!probe.ok && probe.errorCode !== "redirect_refused") {
      return {
        ok: false,
        message:
          probe.errorCode === "timeout"
            ? "Endpoint did not respond (timeout)."
            : "Could not reach the endpoint.",
      };
    }
    return {
      ok: true,
      message:
        "Configuration valid and endpoint reachable. Full verification requires a live send to an authorized test number.",
    };
  }
}
