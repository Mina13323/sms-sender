import crypto from "node:crypto";

/**
 * AES-256-GCM encryption for provider credentials at rest.
 * Key: APP_ENCRYPTION_KEY (base64, 32 bytes).
 * Format: enc:v1:<iv b64>:<tag b64>:<ciphertext b64>
 */

const PREFIX = "enc:v1:";

function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error("APP_ENCRYPTION_KEY is not configured");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("APP_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  }
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(value: string): string {
  if (!value.startsWith(PREFIX)) {
    throw new Error("Invalid encrypted value");
  }
  const [ivB64, tagB64, ctB64] = value.slice(PREFIX.length).split(":");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Non-reversible mask for display, e.g. "AC…1a2b". Never reveals the secret. */
export function maskValue(plain: string): string {
  if (plain.length <= 6) return "••••";
  return `${plain.slice(0, 2)}••••${plain.slice(-4)}`;
}

/** Keyed hash used for rate-limit/duplicate keys so raw values are never stored. */
export function hmacKey(input: string): string {
  const secret = process.env.AUTH_SECRET || "";
  return crypto.createHmac("sha256", secret).update(input).digest("hex").slice(0, 40);
}
