/**
 * Phone number normalization and validation (E.164).
 * No external lookups — strict, predictable rules.
 */

const E164 = /^\+[1-9]\d{7,14}$/;

/** Normalizes common formats to E.164 (+XXXXXXXX). Returns null if invalid. */
export function normalizePhone(raw: string): string | null {
  let s = raw.trim().replace(/[\s\-().]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (!s.startsWith("+") && /^[1-9]\d{7,14}$/.test(s)) {
    // Digits without prefix: require explicit + to avoid ambiguity
    return null;
  }
  return E164.test(s) ? s : null;
}

export interface ParsedRecipients {
  valid: string[];
  invalid: string[];
}

/** Parses a newline/comma separated list of numbers; dedupes valid ones. */
export function parseRecipients(input: string, max = 50): ParsedRecipients {
  const parts = input
    .split(/[\n,;]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, max + 1);

  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    const normalized = normalizePhone(part);
    if (normalized) {
      if (!seen.has(normalized)) {
        seen.add(normalized);
        valid.push(normalized);
      }
    } else {
      invalid.push(part);
    }
  }
  return { valid, invalid };
}
