import { query } from "@/lib/db";

export interface RouteRow {
  id: string;
  country: string;
  country_code: string | null;
  carrier: string;
  provider_id: string;
  provider_name?: string;
  sender_id: string | null;
  price_per_segment: string; // NUMERIC comes back as string
  currency: string;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function routeToPublic(row: RouteRow) {
  return {
    id: row.id,
    country: row.country,
    countryCode: row.country_code,
    carrier: row.carrier,
    providerId: row.provider_id,
    providerName: row.provider_name ?? null,
    senderId: row.sender_id,
    pricePerSegment: Number(row.price_per_segment),
    currency: row.currency,
    priority: row.priority,
    isActive: row.is_active,
  };
}

export async function listRoutes(activeOnly = false): Promise<RouteRow[]> {
  const { rows } = await query<RouteRow>(
    `SELECT r.*, p.name AS provider_name
       FROM sms_routes r
       JOIN providers p ON p.id = r.provider_id
      ${activeOnly ? "WHERE r.is_active = TRUE AND p.is_active = TRUE" : ""}
      ORDER BY r.country ASC, r.carrier ASC, r.priority ASC`,
  );
  return rows;
}

export async function getRoute(id: string): Promise<RouteRow | null> {
  const { rows } = await query<RouteRow>(
    `SELECT r.*, p.name AS provider_name
       FROM sms_routes r JOIN providers p ON p.id = r.provider_id
      WHERE r.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export interface RouteWriteInput {
  country?: string;
  countryCode?: string | null;
  carrier?: string;
  providerId?: string;
  senderId?: string | null;
  pricePerSegment?: number;
  currency?: string;
  priority?: number;
  isActive?: boolean;
}

export async function createRoute(input: Required<Pick<RouteWriteInput, "country" | "carrier" | "providerId" | "pricePerSegment">> & RouteWriteInput): Promise<RouteRow> {
  const { rows } = await query<RouteRow>(
    `INSERT INTO sms_routes
       (country, country_code, carrier, provider_id, sender_id, price_per_segment, currency, priority, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      input.country,
      input.countryCode ?? null,
      input.carrier,
      input.providerId,
      input.senderId ?? null,
      input.pricePerSegment,
      input.currency ?? "USD",
      input.priority ?? 100,
      input.isActive ?? true,
    ],
  );
  return rows[0];
}

export async function updateRoute(id: string, input: RouteWriteInput): Promise<RouteRow | null> {
  const existing = await getRoute(id);
  if (!existing) return null;
  const { rows } = await query<RouteRow>(
    `UPDATE sms_routes SET
       country = $2, country_code = $3, carrier = $4, provider_id = $5,
       sender_id = $6, price_per_segment = $7, currency = $8, priority = $9,
       is_active = $10, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [
      id,
      input.country ?? existing.country,
      input.countryCode === undefined ? existing.country_code : input.countryCode,
      input.carrier ?? existing.carrier,
      input.providerId ?? existing.provider_id,
      input.senderId === undefined ? existing.sender_id : input.senderId,
      input.pricePerSegment ?? Number(existing.price_per_segment),
      input.currency ?? existing.currency,
      input.priority ?? existing.priority,
      input.isActive ?? existing.is_active,
    ],
  );
  return rows[0] ?? null;
}

export async function deleteRoute(id: string): Promise<boolean> {
  const { rowCount } = await query(`DELETE FROM sms_routes WHERE id = $1`, [id]);
  return rowCount > 0;
}
