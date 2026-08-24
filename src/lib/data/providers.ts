import { query } from "@/lib/db";
import { decryptSecret, encryptSecret, maskValue } from "@/lib/crypto";
import {
  GenericHttpConfig,
  ProviderRuntimeConfig,
  ProviderTypeId,
} from "@/services/sms/sms-provider";

const MASKED = "\u2022\u2022\u2022\u2022";
const SENSITIVE_HEADER = /auth|key|secret|token|pass/i;

/**
 * Masks literal values of sensitive-named headers before sending config to the
 * browser. Template references like "Bearer {{apiKey}}" are safe (the secret
 * itself lives encrypted in the credential columns) and stay visible.
 */
function maskHttpConfig(config: GenericHttpConfig | null): GenericHttpConfig | null {
  if (!config) return null;
  const headers = config.headers
    ? Object.fromEntries(
        Object.entries(config.headers).map(([name, value]) => [
          name,
          SENSITIVE_HEADER.test(name) && !value.includes("{{") ? MASKED : value,
        ]),
      )
    : undefined;
  return { ...config, headers };
}

/** Restores masked header values from the stored config on update. */
function unmaskHttpConfig(
  incoming: GenericHttpConfig | null | undefined,
  existing: GenericHttpConfig | null,
): GenericHttpConfig | null {
  if (incoming === undefined) return existing;
  if (incoming === null) return null;
  const headers = incoming.headers
    ? Object.fromEntries(
        Object.entries(incoming.headers).map(([name, value]) => [
          name,
          value === MASKED ? existing?.headers?.[name] ?? "" : value,
        ]),
      )
    : incoming.headers;
  return { ...incoming, headers };
}

export interface ProviderRow {
  id: string;
  name: string;
  type: ProviderTypeId;
  is_active: boolean;
  is_default: boolean;
  priority: number;
  api_base_url: string | null;
  account_sid_enc: string | null;
  api_key_enc: string | null;
  api_secret_enc: string | null;
  sender_id: string | null;
  config: GenericHttpConfig | null;
  created_at: string;
  updated_at: string;
}

/** Public (admin UI) shape — never contains secrets. */
export interface ProviderPublic {
  id: string;
  name: string;
  type: ProviderTypeId;
  isActive: boolean;
  isDefault: boolean;
  priority: number;
  apiBaseUrl: string | null;
  senderId: string | null;
  accountSidMasked: string | null;
  hasApiKey: boolean;
  hasApiSecret: boolean;
  config: GenericHttpConfig | null;
  createdAt: string;
  updatedAt: string;
}

export function toPublic(row: ProviderRow): ProviderPublic {
  let accountSidMasked: string | null = null;
  if (row.account_sid_enc) {
    try {
      accountSidMasked = maskValue(decryptSecret(row.account_sid_enc));
    } catch {
      accountSidMasked = "••••";
    }
  }
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    isActive: row.is_active,
    isDefault: row.is_default,
    priority: row.priority,
    apiBaseUrl: row.api_base_url,
    senderId: row.sender_id,
    accountSidMasked,
    hasApiKey: Boolean(row.api_key_enc),
    hasApiSecret: Boolean(row.api_secret_enc),
    config: maskHttpConfig(row.config),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listProviders(): Promise<ProviderRow[]> {
  const { rows } = await query<ProviderRow>(
    `SELECT * FROM providers ORDER BY priority ASC, created_at ASC`,
  );
  return rows;
}

export async function getProvider(id: string): Promise<ProviderRow | null> {
  const { rows } = await query<ProviderRow>(`SELECT * FROM providers WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export interface ProviderWriteInput {
  name?: string;
  type?: ProviderTypeId;
  isActive?: boolean;
  isDefault?: boolean;
  priority?: number;
  apiBaseUrl?: string | null;
  accountSid?: string; // plaintext in, encrypted at rest
  apiKey?: string;
  apiSecret?: string;
  senderId?: string | null;
  config?: GenericHttpConfig | null;
}

export async function createProvider(input: ProviderWriteInput): Promise<ProviderRow> {
  if (input.isDefault) {
    await query(`UPDATE providers SET is_default = FALSE WHERE is_default = TRUE`);
  }
  const { rows } = await query<ProviderRow>(
    `INSERT INTO providers
       (name, type, is_active, is_default, priority, api_base_url,
        account_sid_enc, api_key_enc, api_secret_enc, sender_id, config)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      input.name,
      input.type,
      input.isActive ?? true,
      input.isDefault ?? false,
      input.priority ?? 100,
      input.apiBaseUrl ?? null,
      input.accountSid ? encryptSecret(input.accountSid) : null,
      input.apiKey ? encryptSecret(input.apiKey) : null,
      input.apiSecret ? encryptSecret(input.apiSecret) : null,
      input.senderId ?? null,
      input.config ? JSON.stringify(input.config) : null,
    ],
  );
  return rows[0];
}

export async function updateProvider(
  id: string,
  input: ProviderWriteInput,
): Promise<ProviderRow | null> {
  const existing = await getProvider(id);
  if (!existing) return null;

  if (input.isDefault) {
    await query(`UPDATE providers SET is_default = FALSE WHERE is_default = TRUE AND id <> $1`, [
      id,
    ]);
  }

  const { rows } = await query<ProviderRow>(
    `UPDATE providers SET
       name = $2,
       is_active = $3,
       is_default = $4,
       priority = $5,
       api_base_url = $6,
       account_sid_enc = $7,
       api_key_enc = $8,
       api_secret_enc = $9,
       sender_id = $10,
       config = $11,
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      input.name ?? existing.name,
      input.isActive ?? existing.is_active,
      input.isDefault ?? existing.is_default,
      input.priority ?? existing.priority,
      input.apiBaseUrl === undefined ? existing.api_base_url : input.apiBaseUrl,
      // Secrets: only replaced when a new non-empty value is provided.
      input.accountSid ? encryptSecret(input.accountSid) : existing.account_sid_enc,
      input.apiKey ? encryptSecret(input.apiKey) : existing.api_key_enc,
      input.apiSecret ? encryptSecret(input.apiSecret) : existing.api_secret_enc,
      input.senderId === undefined ? existing.sender_id : input.senderId,
      (() => {
        const merged = unmaskHttpConfig(input.config, existing.config);
        return merged ? JSON.stringify(merged) : null;
      })(),
    ],
  );
  return rows[0] ?? null;
}

export async function deleteProvider(id: string): Promise<boolean> {
  const { rowCount } = await query(`DELETE FROM providers WHERE id = $1`, [id]);
  return rowCount > 0;
}

/** Decrypts credentials for server-side use only. */
export function toRuntimeConfig(row: ProviderRow): ProviderRuntimeConfig {
  const dec = (v: string | null) => {
    if (!v) return undefined;
    return decryptSecret(v);
  };
  return {
    type: row.type,
    apiBaseUrl: row.api_base_url ?? undefined,
    accountSid: dec(row.account_sid_enc),
    apiKey: dec(row.api_key_enc),
    apiSecret: dec(row.api_secret_enc),
    senderId: row.sender_id ?? undefined,
    statusCallbackUrl: twilioStatusCallbackUrl(),
    http: row.config ?? undefined,
  };
}

/**
 * The public URL Twilio should POST delivery-status callbacks to.
 * Derived from APP_PUBLIC_BASE_URL (e.g. https://sms.example.com). When that
 * env var is absent (local dev), returns undefined and status callbacks are
 * simply not requested — sending still works, only delivery tracking is off.
 */
export function twilioStatusCallbackUrl(): string | undefined {
  const base = process.env.APP_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  if (!base) return undefined;
  return `${base}/api/sms/status`;
}
