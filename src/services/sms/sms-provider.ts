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
}

export type ProviderTypeId = "TWILIO" | "MOCK";

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
};
