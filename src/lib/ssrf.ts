import dns from "node:dns/promises";
import net from "node:net";

/**
 * SSRF protection for admin-configured provider endpoints.
 *
 * Generic HTTP providers let the Super Admin enter arbitrary URLs, so every
 * outbound request target is validated:
 *  - http(s) only; HTTPS required in production
 *  - hostname blocklist (localhost, *.internal, metadata hosts)
 *  - IP literal + DNS-resolved IP checks against private/reserved ranges
 *  - redirects are never followed automatically (callers use redirect:"manual")
 *
 * Dev escape hatch: SMS_HTTP_ALLOW_LOCAL=1 permits localhost targets for
 * local integration testing only. Never set it in production.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.gke.internal",
  "instance-data",
]);

/**
 * Dev escape hatch: SMS_HTTP_ALLOW_LOCAL=1 permits LOOPBACK targets only
 * (localhost / 127.x / ::1) for local integration testing. All other private
 * ranges, link-local and internal hostnames stay blocked even in dev.
 * Never set it in production.
 */
function allowLocal(): boolean {
  return process.env.SMS_HTTP_ALLOW_LOCAL === "1" && process.env.NODE_ENV !== "production";
}

function isLoopbackTarget(hostname: string): boolean {
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  if (net.isIPv4(hostname)) return hostname.startsWith("127.");
  if (net.isIPv6(hostname)) return hostname === "::1";
  return false;
}


export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true; // 0/8, 10/8, loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 192 && b === 0) return true; // 192.0.0/24, 192.0.2/24 test
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved
  return false;
}

export function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true; // unspecified, loopback
  if (lower.startsWith("fe80") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb"))
    return true; // link-local fe80::/10
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA fc00::/7
  if (lower.startsWith("ff")) return true; // multicast
  // IPv4-mapped (::ffff:a.b.c.d)
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true; // not an IP — treat as unsafe when an IP was expected
}

export interface UrlValidationResult {
  ok: boolean;
  reason?: string;
  url?: URL;
}

/** Static validation (no network) — also used when saving provider config. */
export function validateOutboundUrl(rawUrl: string): UrlValidationResult {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Invalid URL." };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "Only http(s) URLs are allowed." };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "Credentials in the URL are not allowed." };
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();

  // Dev-only escape hatch for local stub servers — loopback ONLY.
  if (allowLocal() && isLoopbackTarget(hostname)) {
    return { ok: true, url };
  }

  const isLocalHostname =
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal");

  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {

    return { ok: false, reason: "HTTPS is required." };
  }
  if (isLocalHostname) {
    return { ok: false, reason: "Internal hostnames are not allowed." };
  }
  if (net.isIP(hostname) && isPrivateIp(hostname)) {
    return { ok: false, reason: "Private or reserved IP addresses are not allowed." };
  }
  return { ok: true, url };
}

/** Full validation including DNS resolution of the hostname. */
export async function validateOutboundUrlWithDns(rawUrl: string): Promise<UrlValidationResult> {
  const staticResult = validateOutboundUrl(rawUrl);
  if (!staticResult.ok || !staticResult.url) return staticResult;

  const hostname = staticResult.url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(hostname)) return staticResult; // already checked

  if (allowLocal() && isLoopbackTarget(hostname.toLowerCase())) {
    return staticResult;
  }


  try {
    const records = await dns.lookup(hostname, { all: true });
    for (const record of records) {
      if (isPrivateIp(record.address)) {
        return { ok: false, reason: "Hostname resolves to a private or reserved address." };
      }
    }
  } catch {
    return { ok: false, reason: "Hostname could not be resolved." };
  }
  return staticResult;
}

const MAX_RESPONSE_BYTES = 64 * 1024;

export interface SafeFetchResult {
  ok: boolean;
  status?: number;
  bodyText?: string;
  errorCode?: string; // safe for logs — never contains URL params, bodies or secrets
}

/**
 * Performs the outbound request with SSRF validation, timeout, manual
 * redirect handling (redirects are refused) and a response size cap.
 */
export async function safeFetch(
  rawUrl: string,
  init: { method: string; headers: Record<string, string>; body?: string },
  timeoutMs: number,
): Promise<SafeFetchResult> {
  const validation = await validateOutboundUrlWithDns(rawUrl);
  if (!validation.ok) {
    return { ok: false, errorCode: "blocked_url" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(rawUrl, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      redirect: "manual",
      signal: controller.signal,
    });

    if (response.status >= 300 && response.status < 400) {
      return { ok: false, status: response.status, errorCode: "redirect_refused" };
    }

    // Size-capped body read
    const reader = response.body?.getReader();
    let received = 0;
    const chunks: Uint8Array[] = [];
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > MAX_RESPONSE_BYTES) {
          reader.cancel().catch(() => undefined);
          return { ok: false, status: response.status, errorCode: "response_too_large" };
        }
        chunks.push(value);
      }
    }
    const bodyText = Buffer.concat(chunks).toString("utf8");
    return { ok: true, status: response.status, bodyText };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { ok: false, errorCode: aborted ? "timeout" : "network_error" };
  } finally {
    clearTimeout(timer);
  }
}
