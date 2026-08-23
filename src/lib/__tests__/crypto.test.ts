import { beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
  process.env.AUTH_SECRET = "test-secret-for-hmac-keys";
});

describe("crypto", () => {
  it("round-trips secrets", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto");
    const secret = "SK-super-secret-token-123";
    const enc = encryptSecret(secret);
    expect(enc).not.toContain(secret);
    expect(enc.startsWith("enc:v1:")).toBe(true);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it("produces unique ciphertexts (random IV)", async () => {
    const { encryptSecret } = await import("@/lib/crypto");
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("rejects tampered ciphertext", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto");
    const enc = encryptSecret("value");
    const tampered = enc.slice(0, -4) + (enc.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("masks values without revealing them", async () => {
    const { maskValue } = await import("@/lib/crypto");
    expect(maskValue("ACxxxxxxxxxxxxxxxxxxxx1a2b")).toBe("AC••••1a2b");
    expect(maskValue("short")).toBe("••••");
  });

  it("hmacKey is deterministic and PII-free", async () => {
    const { hmacKey } = await import("@/lib/crypto");
    const a = hmacKey("+221771234567");
    expect(a).toBe(hmacKey("+221771234567"));
    expect(a).not.toContain("221771234567");
    expect(a).toHaveLength(40);
  });
});
