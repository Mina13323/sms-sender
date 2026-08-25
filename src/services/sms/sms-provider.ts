/**
 * Provider-agnostic SMS abstraction.
 *
 * The application talks ONLY to the SmsProvider interface. Each concrete
 * provider (Twilio, future providers) implements it as an adapter.
 *
 * Adding a provider instance (credentials, sender, priority) is done from the
 * Admin UI. Supporting a brand-new provider API protocol requires writing a
 * new adapter here and registering it in `factory.ts` + PROVIDER_TYPES below.
 */

export type SmsMessageStatus =
  | "submitted" // provider accepted/queued the message
  | "sent" // provider reports handed to carrier
  | "delivered" // provider confirmed delivery
  | "undelivered"
  | "failed";

export interface SendSmsInput {
  to: string; // E.164
  body: string;
  from?: string; // sender / CLI override
}

export interface SendSmsResult {
  success: boolean;
  providerMessageId?: string;
  status: SmsMessageStatus;
  /** Safe, non-sensitive error code for logging (never PII, never secrets). */
  errorCode?: string;
}

export interface ProviderHealthResult {
  ok: boolean;
  message: string; // safe to display; never contains secrets
}

export interface SmsProvider {
  sendSms(input: SendSmsInput): Promise<SendSmsResult>;
  validateConfiguration(): Promise<ProviderHealthResult>;
}

/** Decrypted runtime configuration passed to adapters. Never leaves the server. */
export interface ProviderRuntimeConfig {
  type: ProviderTypeId;
  apiBaseUrl?: string;
  accountSid?: string;
  apiKey?: string;
  apiSecret?: string;
  senderId?: string;
  /** Public URL the provider should POST delivery-status callbacks to (optional). */
  statusCallbackUrl?: string;
  /** Non-secret generic HTTP configuration (from the providers.config JSONB). */
  http?: GenericHttpConfig;
}

export type ProviderTypeId = "TWILIO" | "MOCK" | "HTTP" | "VONAGE";

export type HttpAuthType =
  | "NONE"
  | "API_KEY_HEADER"
  | "API_KEY_QUERY"
  | "BEARER"
  | "BASIC"
  | "CUSTOM_HEADER";

/**
 * Admin-configurable generic HTTP/REST provider settings.
 * Secrets are NOT stored here — they live in the encrypted credential columns
 * and are referenced from templates via {{apiKey}} / {{apiSecret}} /
 * {{username}} / {{password}}.
 */
export interface GenericHttpConfig {
  method: "POST" | "GET";
  authType: HttpAuthType;
  /** Header name (API_KEY_HEADER / CUSTOM_HEADER) or query param name (API_KEY_QUERY). */
  authName?: string;
  /** Value template for CUSTOM_HEADER, e.g. "Token {{apiKey}}". */
  authValueTemplate?: string;
  contentType: "application/json" | "application/x-www-form-urlencoded";
  /** Extra headers; values may reference whitelisted template variables. */
  headers?: Record<string, string>;
  /** Query params appended to the endpoint; values may use template variables. */
  queryParams?: Record<string, string>;
  /** Request body template ({{to}}, {{message}}, {{from}}, {{sender}}, {{country}}, secrets). */
  bodyTemplate?: string;
  timeoutMs?: number;
  successCodes?: number[];
  /** JSONPath-lite, e.g. "$.data.id". */
  messageIdPath?: string;
  statusPath?: string;
}


export interface ProviderFieldInfo {
  key: "accountSid" | "apiKey" | "apiSecret" | "senderId" | "apiBaseUrl";
  label: string;
  required: boolean;
  secret: boolean;
  help?: string;
}

/** Metadata that drives the Admin "add provider" form per supported type. */
export const PROVIDER_TYPES: Record<
  ProviderTypeId,
  { label: string; description: string; fields: ProviderFieldInfo[] }
> = {
  TWILIO: {
    label: "Twilio",
    description: "Twilio Programmable Messaging (REST API)",
    fields: [
      { key: "accountSid", label: "Account SID", required: true, secret: false },
      {
        key: "apiSecret",
        label: "Auth Token",
        required: true,
        secret: true,
        help: "Stored encrypted. Never shown again after saving.",
      },
      {
        key: "senderId",
        label: "From (E.164 number or approved Sender ID)",
        required: true,
        secret: false,
      },
      {
        key: "apiBaseUrl",
        label: "API base URL (optional override)",
        required: false,
        secret: false,
      },
    ],
  },
  MOCK: {
    label: "Mock (development only)",
    description: "Simulates sending. Never use in production.",
    fields: [{ key: "senderId", label: "Sender label", required: false, secret: false }],
  },
  HTTP: {
    label: "Generic HTTP / REST",
    description:
      "Connect any SMS provider with an HTTP API — configure endpoint, authentication, request template and response mapping. No code changes required.",
    fields: [
      {
        key: "apiKey",
        label: "API key / token",
        required: false,
        secret: true,
        help: "Stored encrypted. Reference it in templates as {{apiKey}}.",
      },
      {
        key: "apiSecret",
        label: "API secret / password",
        required: false,
        secret: true,
        help: "Stored encrypted. Reference as {{apiSecret}} or {{password}}.",
      },
      {
        key: "accountSid",
        label: "Username / account ID",
        required: false,
        secret: true,
        help: "Used for Basic auth. Reference as {{username}}.",
      },
      { key: "senderId", label: "Sender / CLI ({{from}} in templates)", required: false, secret: false },
    ],
  },
  VONAGE: {
    label: "Vonage",
    description:
      "Vonage (Nexmo) SMS API. Uses API key + secret auth; success/failure is read from the per-message status.",
    fields: [
      {
        key: "apiKey",
        label: "API key",
        required: true,
        secret: false,
        help: "Your Vonage API key (dashboard.vonage.com).",
      },
      {
        key: "apiSecret",
        label: "API secret",
        required: true,
        secret: true,
        help: "Stored encrypted. Never shown again after saving.",
      },
      {
        key: "senderId",
        label: "From (Vonage number or approved Sender ID)",
        required: true,
        secret: false,
        help: "Must be a number rented from Vonage, or an alphanumeric sender approved for the destination.",
      },
      {
        key: "apiBaseUrl",
        label: "API base URL (optional override)",
        required: false,
        secret: false,
      },
    ],
  },
};

