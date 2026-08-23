import { query } from "@/lib/db";

export const SETTING_KEYS = {
  smsRatePerMinute: "sms.rate_per_minute",
  smsMaxRecipients: "sms.max_recipients",
} as const;

export const DEFAULT_SETTINGS = {
  smsRatePerMinute: 10,
  smsMaxRecipients: 10,
};

export async function getSettings(): Promise<typeof DEFAULT_SETTINGS> {
  const { rows } = await query<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key = ANY($1)`,
    [[SETTING_KEYS.smsRatePerMinute, SETTING_KEYS.smsMaxRecipients]],
  );
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const num = (key: string, fallback: number) => {
    const v = Number(map.get(key));
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  return {
    smsRatePerMinute: num(SETTING_KEYS.smsRatePerMinute, DEFAULT_SETTINGS.smsRatePerMinute),
    smsMaxRecipients: num(SETTING_KEYS.smsMaxRecipients, DEFAULT_SETTINGS.smsMaxRecipients),
  };
}

export async function setSetting(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
    [key, value],
  );
}
