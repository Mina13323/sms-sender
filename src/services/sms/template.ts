/**
 * Secure, data-only template rendering for generic HTTP providers.
 *
 * - Only whitelisted {{variables}} are substituted — everything else is left
 *   untouched (no code execution, no eval, no expressions).
 * - JSON mode escapes values per JSON string rules so `"{{message}}"` is safe.
 * - Form/query mode URL-encodes values.
 */

export type TemplateVars = Partial<
  Record<
    | "to"
    | "message"
    | "from"
    | "sender"
    | "country"
    | "apiKey"
    | "apiSecret"
    | "username"
    | "password",
    string
  >
>;

const ALLOWED_VARS = new Set([
  "to",
  "message",
  "from",
  "sender",
  "country",
  "apiKey",
  "apiSecret",
  "username",
  "password",
]);

const VAR_PATTERN = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

function jsonEscape(value: string): string {
  // JSON.stringify adds surrounding quotes; strip them to inline inside templates.
  return JSON.stringify(value).slice(1, -1);
}

export type TemplateMode = "json" | "form" | "raw";

export function renderTemplate(template: string, vars: TemplateVars, mode: TemplateMode): string {
  return template.replace(VAR_PATTERN, (whole, name: string) => {
    if (!ALLOWED_VARS.has(name)) return whole; // unknown variables left as-is
    const value = vars[name as keyof TemplateVars] ?? "";
    if (mode === "json") return jsonEscape(value);
    if (mode === "form") return encodeURIComponent(value);
    return value;
  });
}

/** Lists variable names referenced by a template (for validation/UX). */
export function listTemplateVars(template: string): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(VAR_PATTERN)) {
    found.add(match[1]);
  }
  return [...found];
}

/**
 * Minimal JSONPath-lite getter supporting `$.a.b.c`, `a.b.c` and numeric
 * array indices like `$.data.messages.0.id`. No expressions, no wildcards.
 */
export function getJsonPath(obj: unknown, path: string): unknown {
  if (!path) return undefined;
  const clean = path.replace(/^\$\.?/, "").replace(/\[(\d+)\]/g, ".$1");
  if (!clean) return obj;
  let current: unknown = obj;
  for (const segment of clean.split(".")) {
    if (segment === "") continue;
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
