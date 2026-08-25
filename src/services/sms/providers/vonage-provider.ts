import {
  ProviderHealthResult,
  ProviderRuntimeConfig,
  SendSmsInput,
  SendSmsResult,
  SmsProvider,
} from "../sms-provider";

const DEFAULT_BASE_URL = "https://rest.nexmo.com";

/**
 * Public, human-readable explanations for the Vonage SMS status codes users are
 * most likely to hit. Returns null for codes we don't catalogue. Descriptions
 * are generic — they never echo the destination number or message body.
 */
export interface VonageErrorHint {
  title: string;
  hint: string;
}

export function describeVonageErrorCode(code: string | number | undefined): VonageErrorHint | null {
  const n = typeof code === "number" ? code : Number(code);
  if (!Number.isFinite(n)) return null;
  const table: Record<number, VonageErrorHint> = {
    1: { title: "Throttled", hint: "Too many requests too fast. Slow down and retry shortly." },
    2: { title: "Missing parameters", hint: "The request is missing required fields. Check the recipient and sender." },
    3: { title: "Invalid parameters", hint: "A field is invalid (e.g. the recipient number format). Use international format like +2012…​." },
    4: {
      title: "Invalid credentials",
      hint: "The Vonage API key / secret is wrong. Re-check them on dashboard.vonage.com and update the provider.",
    },
    6: { title: "Invalid message", hint: "The message content was rejected (e.g. unsupported encoding/characters)." },
    7: { title: "Number barred", hint: "The destination is blocked from receiving messages." },
    9: {
      title: "Quota / balance exceeded",
      hint: "Your Vonage account is out of credit or hit a quota. Top up the balance in the Vonage dashboard.",
    },
    11: {
      title: "Account not enabled for SMS",
      hint: "The Vonage account isn't enabled to send via the SMS API. Enable SMS in the Vonage dashboard.",
    },
    12: { title: "Message too long", hint: "The message exceeds the maximum length. Shorten it and retry." },
    15: {
      title: "Invalid sender",
      hint: "The 'From' sender isn't allowed. Use a Vonage number you've rented, or an alphanumeric sender approved for the destination country.",
    },
    22: { title: "Invalid network", hint: "The destination network couldn't be reached." },
    23: { title: "Invalid callback", hint: "A callback URL configured on the account is invalid." },
    29: {
      title: "Non-whitelisted destination",
      hint: "This destination isn't allowed (trial/account restriction). Verify the destination or remove the account restriction in Vonage.",
    },
    32: { title: "Signature mismatch", hint: "Request signature verification failed." },
    33: { title: "Number deactivated", hint: "The destination number is no longer active." },
  };
  const found = table[n];
  if (!found) return null;
  return { ...found, title: `${found.title} (Vonage vonage_${n})` };
}

/** Strips trailing slashes; falls back to the default REST host when empty. */
export function normalizeVonageBaseUrl(raw?: string): string {
  const url = (raw || "").trim().replace(/\/+$/, "");
  return url || DEFAULT_BASE_URL;
}

interface VonageMessageItem {
  status?: string;
  "message-id"?: string;
  messageId?: string;
  "error-text"?: string;
}

interface VonageSmsResponse {
  "message-count"?: string;
  messages?: VonageMessageItem[];
}

/**
 * Vonage (Nexmo) SMS adapter (REST API, zero extra dependencies).
 *
 * Important: Vonage returns HTTP 200 for BOTH success and logical failure —
 * the outcome is in `messages[].status` ("0" = accepted). This adapter reads
 * that field so failures are reported as failures (unlike the generic HTTP
 * provider, which would treat the 200 as success). Credentials come decrypted
 * from the database — never from the client.
 */
export class VonageProvider implements SmsProvider {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly from?: string;
  private readonly baseUrl: string;

  constructor(config: ProviderRuntimeConfig) {
    this.apiKey = config.apiKey ?? "";
    this.apiSecret = config.apiSecret ?? "";
    this.from = config.senderId;
    this.baseUrl = normalizeVonageBaseUrl(config.apiBaseUrl);
  }

  private configured(): boolean {
    return Boolean(this.apiKey && this.apiSecret);
  }

  async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
    const from = input.from || this.from;
    if (!this.configured() || !from) {
      return { success: false, status: "failed", errorCode: "provider_not_configured" };
    }

    try {
      const response = await fetch(`${this.baseUrl}/sms/json`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          api_key: this.apiKey,
          api_secret: this.apiSecret,
          from,
          to: input.to,
          text: input.body,
        }).toString(),
      });

      const data = (await response.json().catch(() => ({}))) as VonageSmsResponse;
      const msg = data.messages?.[0];

      // Non-2xx from Vonage is unusual (it normally 200s), but treat it as a
      // transport failure if it happens.
      if (!response.ok || !msg) {
        console.error(
          `VonageProvider: unexpected response (http ${response.status})`,
        );
        return { success: false, status: "failed", errorCode: `http_${response.status}` };
      }

      const status = String(msg.status ?? "");
      if (status === "0") {
        return {
          success: true,
          // error-text is never surfaced; message-id is safe (not PII).
          providerMessageId: msg["message-id"] ?? msg.messageId,
          status: "submitted",
        };
      }

      // Log ONLY the numeric Vonage status — error-text can reference the
      // destination number, so it is never logged or returned.
      console.error(`VonageProvider: send rejected (status ${status || "n/a"})`);
      return {
        success: false,
        status: "failed",
        errorCode: status ? `vonage_${status}` : "vonage_unknown",
      };
    } catch {
      console.error("VonageProvider: network error during send.");
      return { success: false, status: "failed", errorCode: "network_error" };
    }
  }

  /**
   * Verifies credentials and reachability WITHOUT sending an SMS, using the
   * Vonage account balance endpoint. A valid balance means auth works.
   */
  async validateConfiguration(): Promise<ProviderHealthResult> {
    if (!this.configured()) {
      return { ok: false, message: "Missing API key or API secret." };
    }
    try {
      const url = `${this.baseUrl}/account/get-balance?${new URLSearchParams({
        api_key: this.apiKey,
        api_secret: this.apiSecret,
      })}`;
      const response = await fetch(url, { method: "GET" });
      const data = (await response.json().catch(() => ({}))) as { value?: number };
      if (response.ok && typeof data.value === "number") {
        return {
          ok: true,
          message: `Connected to Vonage. Account balance: ${data.value.toFixed(4)}.`,
        };
      }
      if (response.status === 401 || response.status === 403) {
        return { ok: false, message: "Authentication failed. Check the API key / secret." };
      }
      return { ok: false, message: `Vonage returned HTTP ${response.status}.` };
    } catch {
      return { ok: false, message: "Could not reach the Vonage API." };
    }
  }
}
