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
 * Public, human-readable explanations for the Twilio error codes users are
 * most likely to hit. Returns null for codes we don't catalogue, so callers
 * can fall back to showing the raw code. Descriptions are generic — they
 * never echo back the destination number or message body.
 */
export interface TwilioErrorHint {
  title: string;
  hint: string;
}

export function describeTwilioErrorCode(code: string | number | undefined): TwilioErrorHint | null {
  const n = typeof code === "number" ? code : Number(code);
  if (!Number.isFinite(n)) return null;
  const key = `twilio_${n}`;
  // Map keyed by the numeric Twilio code (see https://twilio.com/docs/api/errors)
  const table: Record<number, TwilioErrorHint> = {
    21211: {
      title: "Invalid 'To' number",
      hint: "The destination number isn't a valid phone number. Check the country code and digits.",
    },
    21408: {
      title: "Geographic permissions disabled",
      hint: "SMS to this country isn't enabled. In the Twilio console go to Messaging → Settings → Geo Permissions and enable the destination country. Changes apply immediately.",
    },
    21602: {
      title: "Empty or invalid message",
      hint: "The message body or parameters were rejected. Verify the content and try again.",
    },
    21608: {
      title: "Trial account — unverified number",
      hint: "A Twilio trial account can only send to numbers you've verified first. Either verify the recipient under Phone Numbers → Verified Caller IDs, or upgrade the account and complete an approved Primary Compliance Profile.",
    },
    21610: {
      title: "Unreachable / blocked number",
      hint: "Twilio won't deliver to this number (blocked, opted out, or unreachable). Try a different recipient.",
    },
    21611: {
      title: "Unreachable number",
      hint: "The number can't receive SMS (e.g. a landline). Use a mobile number.",
    },
    21612: {
      title: "Invalid 'From' number",
      hint: "The sending number/Sender ID isn't valid for this route. Check the 'From' setting on the provider.",
    },
    21614: {
      title: "'From' number not SMS-capable",
      hint: "The configured 'From' number can't send SMS. Use a Twilio SMS-capable number or an approved Sender ID.",
    },
    21709: {
      title: "A2P 10DLC not registered",
      hint: "US/Canada 10DLC traffic requires campaign registration. Register the sender in the Twilio console, or use a verified toll-free/short code.",
    },
    30001: { title: "Queue overflow", hint: "Twilio's queue overflowed. Retry shortly." },
    30002: { title: "Account suspended", hint: "The Twilio account is suspended. Check the account status." },
    30003: { title: "Unreachable number", hint: "The handset is unavailable or out of coverage." },
    30004: { title: "Message blocked", hint: "The recipient blocked the message (e.g. replied STOP)." },
    30005: { title: "Unknown destination", hint: "The carrier reported the destination as unknown." },
    30006: { title: "Landline / not SMS-capable", hint: "The number can't receive SMS." },
    30007: { title: "Carrier violation", hint: "Flagged as spam by the carrier. Shorten the message and avoid spam-like content." },
    30008: { title: "Unknown error", hint: "The carrier reported an unspecified error." },
    30034: { title: "Blocked message content", hint: "Twilio blocked the content (prohibited/filtered). Revise the message." },
    63024: { title: "Filtered by carrier", hint: "A carrier filter blocked the message. Register A2P 10DLC / verify the sender or adjust content." },
  };
  const found = table[n];
  if (!found) return null;
  return { ...found, title: `${found.title} (Twilio ${key})` };
}

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
  private readonly statusCallbackUrl?: string;

  constructor(config: ProviderRuntimeConfig) {
    this.accountSid = config.accountSid ?? "";
    this.authToken = config.apiSecret ?? "";
    this.from = config.senderId;
    this.baseUrl = normalizeTwilioBaseUrl(config.apiBaseUrl);
    this.statusCallbackUrl = config.statusCallbackUrl?.trim() || undefined;
  }


  private authHeader(): string {
    return "Basic " + Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
  }

  private configured(): boolean {
    return Boolean(this.accountSid && this.authToken);
  }

  /**
   * Builds the form-encoded body for a send. When a public status-callback
   * URL is configured, Twilio is asked to POST delivery updates there, so the
   * app can record the *real* outcome (delivered / undelivered / failed)
   * instead of treating "queued" as success.
   */
  private buildRequestBody(input: SendSmsInput): Record<string, string> {
    const from = input.from || this.from || "";
    const body: Record<string, string> = { To: input.to, From: from, Body: input.body };
    if (this.statusCallbackUrl) {
      body.StatusCallback = this.statusCallbackUrl;
    }
    return body;
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
          body: new URLSearchParams(this.buildRequestBody(input)).toString(),
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
