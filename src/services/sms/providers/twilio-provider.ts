import {
  ProviderHealthResult,
  ProviderRuntimeConfig,
  SendSmsInput,
  SendSmsResult,
  SmsMessageStatus,
  SmsProvider,
} from "../sms-provider";

const DEFAULT_BASE_URL = "https://api.twilio.com";

/**
 * Normalizes a Twilio base-URL override. The adapter appends
 * "/2010-04-01/Accounts/..." itself, so a version path (or trailing slashes)
 * accidentally included in the override is stripped to avoid doubled paths
 * like "/2010-04-01/2010-04-01/..." which produce HTTP 404.
 */
export function normalizeTwilioBaseUrl(raw?: string): string {
  let url = (raw || "").trim().replace(/\/+$/, "");
  if (!url) return DEFAULT_BASE_URL;
  url = url.replace(/\/2010-04-01(\/Accounts)?$/i, "");
  return url.replace(/\/+$/, "") || DEFAULT_BASE_URL;
}


/** Maps Twilio message statuses to our provider-agnostic statuses. */
export function mapTwilioStatus(status: string | undefined): SmsMessageStatus {
  switch ((status || "").toLowerCase()) {
    case "delivered":
      return "delivered";
    case "sent":
    case "sending":
      return "sent";
    case "undelivered":
      return "undelivered";
    case "failed":
    case "canceled":
      return "failed";
    case "queued":
    case "accepted":
    case "scheduled":
    default:
      return "submitted";
  }
}

/**
 * Twilio Programmable Messaging adapter (REST API, zero extra dependencies).
 * Credentials come decrypted from the database — never from the client.
 */
export class TwilioProvider implements SmsProvider {
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly from?: string;
  private readonly baseUrl: string;

  constructor(config: ProviderRuntimeConfig) {
    this.accountSid = config.accountSid ?? "";
    this.authToken = config.apiSecret ?? "";
    this.from = config.senderId;
    this.baseUrl = normalizeTwilioBaseUrl(config.apiBaseUrl);
  }


  private authHeader(): string {
    return "Basic " + Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
  }

  private configured(): boolean {
    return Boolean(this.accountSid && this.authToken);
  }

  async sendSms(input: SendSmsInput): Promise<SendSmsResult> {
    const from = input.from || this.from;
    if (!this.configured() || !from) {
      return { success: false, status: "failed", errorCode: "provider_not_configured" };
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: this.authHeader(),
          },
          body: new URLSearchParams({ To: input.to, From: from, Body: input.body }).toString(),
        },
      );

      const data = (await response.json().catch(() => ({}))) as {
        sid?: string;
        status?: string;
        code?: number;
      };

      if (!response.ok) {
        // Log ONLY the numeric Twilio error code — Twilio error messages can
        // contain the destination number (PII), so they are never logged.
        console.error(
          `TwilioProvider: send rejected (http ${response.status}, code ${data.code ?? "n/a"})`,
        );
        return {
          success: false,
          status: "failed",
          errorCode: data.code ? `twilio_${data.code}` : `http_${response.status}`,
        };
      }

      return {
        success: true,
        providerMessageId: data.sid,
        status: mapTwilioStatus(data.status),
      };
    } catch {
      console.error("TwilioProvider: network error during send.");
      return { success: false, status: "failed", errorCode: "network_error" };
    }
  }

  async validateConfiguration(): Promise<ProviderHealthResult> {
    if (!this.configured()) {
      return { ok: false, message: "Missing Account SID or Auth Token." };
    }
    try {
      const response = await fetch(
        `${this.baseUrl}/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}.json`,
        { headers: { Authorization: this.authHeader() } },
      );
      if (response.ok) {
        return { ok: true, message: "Connected to Twilio successfully." };
      }
      if (response.status === 401) {
        return { ok: false, message: "Authentication failed. Check Account SID / Auth Token." };
      }
      if (response.status === 404) {
        return {
          ok: false,
          message:
            "Twilio returned HTTP 404 — check the Account SID and clear the API base URL override (leave it empty to use the default).",
        };
      }
      return { ok: false, message: `Twilio returned HTTP ${response.status}.` };

    } catch {
      return { ok: false, message: "Could not reach the Twilio API." };
    }
  }
}
