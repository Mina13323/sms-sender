import { query } from "@/lib/db";
import { getProvider, ProviderRow, toRuntimeConfig } from "@/lib/data/providers";
import { getRoute } from "@/lib/data/routes";
import { createProviderAdapter } from "./factory";
import { SmsProvider } from "./sms-provider";
import { countSegments } from "@/lib/segments";

export interface SendingContext {
  adapter: SmsProvider;
  provider: ProviderRow;
  from?: string;
  routeLabel?: string;
}

export type ResolveError = "route_not_found" | "route_inactive" | "no_active_provider";

/**
 * Resolves which provider/sender to use for a send request.
 * - explicit routeId: route must be active and its provider active
 * - otherwise: the default active provider, else highest-priority active one
 */
export async function resolveSendingContext(
  routeId?: string | null,
): Promise<{ context?: SendingContext; error?: ResolveError }> {
  if (routeId) {
    const route = await getRoute(routeId);
    if (!route) return { error: "route_not_found" };
    if (!route.is_active) return { error: "route_inactive" };
    const provider = await getProvider(route.provider_id);
    if (!provider || !provider.is_active) return { error: "route_inactive" };
    return {
      context: {
        adapter: createProviderAdapter(toRuntimeConfig(provider)),
        provider,
        from: route.sender_id ?? provider.sender_id ?? undefined,
        routeLabel: `${route.country} / ${route.carrier}`,
      },
    };
  }

  const { rows } = await query<ProviderRow>(
    `SELECT * FROM providers WHERE is_active = TRUE
      ORDER BY is_default DESC, priority ASC, created_at ASC LIMIT 1`,
  );
  const provider = rows[0];
  if (!provider) return { error: "no_active_provider" };
  return {
    context: {
      adapter: createProviderAdapter(toRuntimeConfig(provider)),
      provider,
      from: provider.sender_id ?? undefined,
    },
  };
}

export interface PerRecipientResult {
  to: string; // echoed back to the requesting client only (never persisted/logged)
  success: boolean;
  status: string;
}

export interface SendBatchResult {
  results: PerRecipientResult[];
  sentCount: number;
  failedCount: number;
  segmentsPerMessage: number;
}

/** Sends one message to multiple recipients sequentially (small batches only). */
export async function sendBatch(
  context: SendingContext,
  recipients: string[],
  message: string,
  userId: string,
): Promise<SendBatchResult> {
  const seg = countSegments(message);
  const results: PerRecipientResult[] = [];
  let sentCount = 0;
  let failedCount = 0;

  for (const to of recipients) {
    const result = await context.adapter.sendSms({ to, body: message, from: context.from });
    if (result.success) {
      sentCount += 1;
    } else {
      failedCount += 1;
    }
    results.push({ to, success: result.success, status: result.status });
  }

  // Aggregate, PII-free usage counters (numbers only — no bodies, no recipients).
  await query(
    `INSERT INTO usage_counters (day, user_id, messages, segments, failed)
     VALUES (CURRENT_DATE, $1, $2, $3, $4)
     ON CONFLICT (day, user_id) DO UPDATE SET
       messages = usage_counters.messages + $2,
       segments = usage_counters.segments + $3,
       failed = usage_counters.failed + $4`,
    [userId, sentCount, sentCount * seg.segments, failedCount],
  ).catch(() => {
    // usage accounting must never fail the send
  });

  return { results, sentCount, failedCount, segmentsPerMessage: seg.segments };
}
