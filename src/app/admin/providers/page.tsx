"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Input, Label, Select, Textarea } from "@/components/ui";

interface FieldInfo {
  key: "accountSid" | "apiKey" | "apiSecret" | "senderId" | "apiBaseUrl";
  label: string;
  required: boolean;
  secret: boolean;
  help?: string;
}

interface ProviderTypeInfo {
  label: string;
  description: string;
  fields: FieldInfo[];
}

interface HttpConfig {
  method: "POST" | "GET";
  authType: string;
  authName?: string;
  authValueTemplate?: string;
  contentType: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  bodyTemplate?: string;
  timeoutMs?: number;
  successCodes?: number[];
  messageIdPath?: string;
  statusPath?: string;
}

interface Provider {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  isDefault: boolean;
  priority: number;
  apiBaseUrl: string | null;
  senderId: string | null;
  accountSidMasked: string | null;
  hasApiKey: boolean;
  hasApiSecret: boolean;
  config: HttpConfig | null;
}

const AUTH_TYPES = [
  { id: "NONE", label: "None" },
  { id: "BEARER", label: "Bearer token ({{apiKey}})" },
  { id: "API_KEY_HEADER", label: "API key in header" },
  { id: "API_KEY_QUERY", label: "API key in query parameter" },
  { id: "BASIC", label: "Basic auth (username + password)" },
  { id: "CUSTOM_HEADER", label: "Custom header" },
];

const DEFAULT_BODY_TEMPLATE = `{
  "to": "{{to}}",
  "message": "{{message}}",
  "from": "{{from}}"
}`;

function mapToLines(map?: Record<string, string>, sep = ": "): string {
  if (!map) return "";
  return Object.entries(map)
    .map(([k, v]) => `${k}${sep}${v}`)
    .join("\n");
}

function linesToMap(text: string, sep: ":" | "="): Record<string, string> | undefined {
  const map: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(sep);
    if (idx <= 0) continue;
    map[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return Object.keys(map).length ? map : undefined;
}

/** Collects the Generic HTTP config out of the submitted form. */
function collectHttpConfig(form: FormData): HttpConfig {
  const successCodes = String(form.get("http_successCodes") ?? "")
    .split(/[,\s]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n >= 100 && n <= 599);
  return {
    method: form.get("http_method") === "GET" ? "GET" : "POST",
    authType: String(form.get("http_authType") || "NONE"),
    authName: String(form.get("http_authName") || "") || undefined,
    authValueTemplate: String(form.get("http_authValueTemplate") || "") || undefined,
    contentType:
      form.get("http_contentType") === "application/x-www-form-urlencoded"
        ? "application/x-www-form-urlencoded"
        : "application/json",
    headers: linesToMap(String(form.get("http_headers") || ""), ":"),
    queryParams: linesToMap(String(form.get("http_queryParams") || ""), "="),
    bodyTemplate: String(form.get("http_bodyTemplate") || "") || undefined,
    timeoutMs: Number(form.get("http_timeoutMs")) || 15000,
    successCodes: successCodes.length ? successCodes : [200, 201, 202],
    messageIdPath: String(form.get("http_messageIdPath") || "") || undefined,
    statusPath: String(form.get("http_statusPath") || "") || undefined,
  };
}

/** Conditional Generic HTTP configuration sections. */
function HttpConfigForm({ provider }: { provider?: Provider }) {
  const cfg = provider?.config ?? undefined;
  const [authType, setAuthType] = useState(cfg?.authType ?? "NONE");
  const [method, setMethod] = useState(cfg?.method ?? "POST");

  const needsAuthName = ["API_KEY_HEADER", "API_KEY_QUERY", "CUSTOM_HEADER"].includes(authType);
  const needsApiKey = ["BEARER", "API_KEY_HEADER", "API_KEY_QUERY", "CUSTOM_HEADER"].includes(authType);
  const needsBasic = authType === "BASIC";

  return (
    <>
      <fieldset className="sm:col-span-2 grid grid-cols-1 gap-4 rounded-md border border-gray-200 p-4 sm:grid-cols-2">
        <legend className="px-1 text-xs font-semibold uppercase text-gray-500">Request</legend>
        <div>
          <Label htmlFor="h-endpoint">Endpoint URL</Label>
          <Input
            id="h-endpoint"
            name="apiBaseUrl"
            required={!provider}
            defaultValue={provider?.apiBaseUrl ?? ""}
            placeholder="https://api.example.com/v1/messages"
          />
        </div>
        <div>
          <Label htmlFor="h-method">HTTP method</Label>
          <Select
            id="h-method"
            name="http_method"
            value={method}
            onChange={(e) => setMethod(e.target.value as "POST" | "GET")}
          >
            <option value="POST">POST</option>
            <option value="GET">GET</option>
          </Select>
        </div>
        {method === "POST" && (
          <>
            <div>
              <Label htmlFor="h-contentType">Content type</Label>
              <Select id="h-contentType" name="http_contentType" defaultValue={cfg?.contentType ?? "application/json"}>
                <option value="application/json">application/json</option>
                <option value="application/x-www-form-urlencoded">application/x-www-form-urlencoded</option>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="h-body">Request body template</Label>
              <Textarea
                id="h-body"
                name="http_bodyTemplate"
                rows={5}
                className="font-mono text-xs"
                defaultValue={cfg?.bodyTemplate ?? DEFAULT_BODY_TEMPLATE}
              />
              <p className="mt-1 text-xs text-gray-500">
                {"Variables: {{to}} {{message}} {{from}} {{sender}} {{country}} {{apiKey}} {{apiSecret}} {{username}} {{password}}"}
              </p>
            </div>
          </>
        )}
        <div>
          <Label htmlFor="h-query">Query parameters (key=value per line)</Label>
          <Textarea
            id="h-query"
            name="http_queryParams"
            rows={2}
            className="font-mono text-xs"
            defaultValue={mapToLines(cfg?.queryParams, "=")}
            placeholder={"to={{to}}\ntext={{message}}"}
          />
        </div>
        <div>
          <Label htmlFor="h-headers">Custom headers (Name: value per line)</Label>
          <Textarea
            id="h-headers"
            name="http_headers"
            rows={2}
            className="font-mono text-xs"
            defaultValue={mapToLines(cfg?.headers)}
            placeholder={"X-Client: sms-panel"}
          />
        </div>
      </fieldset>

      <fieldset className="sm:col-span-2 grid grid-cols-1 gap-4 rounded-md border border-gray-200 p-4 sm:grid-cols-2">
        <legend className="px-1 text-xs font-semibold uppercase text-gray-500">Authentication</legend>
        <div>
          <Label htmlFor="h-auth">Authentication type</Label>
          <Select id="h-auth" name="http_authType" value={authType} onChange={(e) => setAuthType(e.target.value)}>
            {AUTH_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
        {needsAuthName && (
          <div>
            <Label htmlFor="h-authName">
              {authType === "API_KEY_QUERY" ? "Query parameter name" : "Header name"}
            </Label>
            <Input
              id="h-authName"
              name="http_authName"
              defaultValue={cfg?.authName ?? ""}
              placeholder={authType === "API_KEY_QUERY" ? "api_key" : "X-API-Key"}
            />
          </div>
        )}
        {authType === "CUSTOM_HEADER" && (
          <div>
            <Label htmlFor="h-authValue">Header value template</Label>
            <Input
              id="h-authValue"
              name="http_authValueTemplate"
              defaultValue={cfg?.authValueTemplate ?? ""}
              placeholder="Token {{apiKey}}"
            />
          </div>
        )}
        {needsApiKey && (
          <div>
            <Label htmlFor="h-apiKey">API key / token</Label>
            <Input
              id="h-apiKey"
              name="apiKey"
              type="password"
              placeholder={provider?.hasApiKey ? "•••••• (leave blank to keep)" : ""}
            />
            <p className="mt-1 text-xs text-gray-500">Stored encrypted, never shown again.</p>
          </div>
        )}
        {needsBasic && (
          <>
            <div>
              <Label htmlFor="h-username">Username</Label>
              <Input
                id="h-username"
                name="accountSid"
                type="password"
                placeholder={provider?.accountSidMasked ? "•••••• (leave blank to keep)" : ""}
              />
            </div>
            <div>
              <Label htmlFor="h-password">Password</Label>
              <Input
                id="h-password"
                name="apiSecret"
                type="password"
                placeholder={provider?.hasApiSecret ? "•••••• (leave blank to keep)" : ""}
              />
            </div>
          </>
        )}
        <div>
          <Label htmlFor="h-sender">{"Sender / CLI ({{from}})"}</Label>
          <Input id="h-sender" name="senderId" defaultValue={provider?.senderId ?? ""} placeholder="MyBrand or +1555..." />
        </div>
      </fieldset>

      <fieldset className="sm:col-span-2 grid grid-cols-1 gap-4 rounded-md border border-gray-200 p-4 sm:grid-cols-3">
        <legend className="px-1 text-xs font-semibold uppercase text-gray-500">Response & advanced</legend>
        <div>
          <Label htmlFor="h-success">Success status codes</Label>
          <Input
            id="h-success"
            name="http_successCodes"
            defaultValue={(cfg?.successCodes ?? [200, 201, 202]).join(", ")}
            placeholder="200, 201, 202"
          />
        </div>
        <div>
          <Label htmlFor="h-msgid">Message ID path</Label>
          <Input id="h-msgid" name="http_messageIdPath" defaultValue={cfg?.messageIdPath ?? ""} placeholder="$.data.id" />
        </div>
        <div>
          <Label htmlFor="h-status">Status path</Label>
          <Input id="h-status" name="http_statusPath" defaultValue={cfg?.statusPath ?? ""} placeholder="$.status" />
        </div>
        <div>
          <Label htmlFor="h-timeout">Timeout (ms)</Label>
          <Input
            id="h-timeout"
            name="http_timeoutMs"
            type="number"
            min={1000}
            max={60000}
            defaultValue={cfg?.timeoutMs ?? 15000}
          />
        </div>
      </fieldset>
    </>
  );
}

export default function AdminProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [types, setTypes] = useState<Record<string, ProviderTypeInfo>>({});
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState("HTTP");
  const [editing, setEditing] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/providers");
    const data = await res.json();
    if (data.success) {
      setProviders(data.providers);
      setTypes(data.providerTypes);
    }
  }, []);

  useEffect(() => {
    // Defer to a microtask so state updates never happen synchronously in the effect.
    void Promise.resolve().then(load);
  }, [load]);

  const collectFields = (form: FormData, typeInfo: ProviderTypeInfo) => {
    const body: Record<string, unknown> = {};
    for (const field of typeInfo.fields) {
      const value = String(form.get(field.key) ?? "").trim();
      if (value) body[field.key] = value;
    }
    return body;
  };

  const createProvider = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    const form = new FormData(e.currentTarget);
    const typeInfo = types[createType];
    const payload: Record<string, unknown> = {
      name: form.get("name"),
      type: createType,
      priority: Number(form.get("priority") || 100),
      isActive: form.get("isActive") === "on",
      isDefault: form.get("isDefault") === "on",
      ...collectFields(form, typeInfo),
    };
    if (createType === "HTTP") {
      payload.apiBaseUrl = String(form.get("apiBaseUrl") || "");
      payload.config = collectHttpConfig(form);
    }
    const res = await fetch("/api/admin/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setBusy(false);
    if (data.success) {
      setFeedback({ tone: "success", text: "Provider created." });
      setShowCreate(false);
      load();
    } else {
      setFeedback({ tone: "error", text: data.message || "Failed to create provider." });
    }
  };

  const saveEdit = async (e: FormEvent<HTMLFormElement>, provider: Provider) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    const form = new FormData(e.currentTarget);
    const typeInfo = types[provider.type];
    const payload: Record<string, unknown> = {
      name: form.get("name"),
      priority: Number(form.get("priority") || provider.priority),
      ...collectFields(form, typeInfo),
    };
    if (provider.type === "HTTP") {
      payload.apiBaseUrl = String(form.get("apiBaseUrl") || provider.apiBaseUrl || "");
      payload.config = collectHttpConfig(form);
      const sender = String(form.get("senderId") ?? "").trim();
      payload.senderId = sender || null;
    } else if (form.has("apiBaseUrl")) {
      // Built-in providers: an emptied override field clears it (null),
      // so a wrong base URL can always be removed from the UI.
      payload.apiBaseUrl = String(form.get("apiBaseUrl") ?? "").trim() || null;
    }

    const res = await fetch(`/api/admin/providers/${provider.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setBusy(false);
    if (data.success) {
      setFeedback({ tone: "success", text: "Provider updated." });
      setEditing(null);
      load();
    } else {
      setFeedback({ tone: "error", text: data.message || "Update failed." });
    }
  };

  const patch = async (id: string, body: Record<string, unknown>, okText: string) => {
    setFeedback(null);
    const res = await fetch(`/api/admin/providers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) {
      setFeedback({ tone: "success", text: okText });
      load();
    } else {
      setFeedback({ tone: "error", text: data.message || "Update failed." });
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this provider? Routes using it will also be removed.")) return;
    const res = await fetch(`/api/admin/providers/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      setFeedback({ tone: "success", text: "Provider deleted." });
      load();
    } else {
      setFeedback({ tone: "error", text: data.message || "Delete failed." });
    }
  };

  const test = async (id: string) => {
    setTestResult((prev) => ({ ...prev, [id]: "Testing…" }));
    const res = await fetch(`/api/admin/providers/${id}/test`, { method: "POST" });
    const data = await res.json();
    setTestResult((prev) => ({
      ...prev,
      [id]: data.success ? `${data.result} — ${data.message}` : "FAILED",
    }));
  };

  const renderBuiltinFields = (typeInfo: ProviderTypeInfo, provider?: Provider) => (
    <>
      {typeInfo.fields.map((field) => (
        <div key={field.key}>
          <Label htmlFor={`f-${field.key}`}>{field.label}</Label>
          <Input
            id={`f-${field.key}`}
            name={field.key}
            type={field.secret ? "password" : "text"}
            required={field.required && !provider}
            placeholder={
              field.key === "apiBaseUrl"
                ? "https://api.twilio.com (leave empty for default)"
                : provider
                  ? field.secret
                    ? provider.hasApiSecret || provider.hasApiKey || provider.accountSidMasked
                      ? "•••••• (leave blank to keep)"
                      : ""
                    : field.key === "accountSid"
                      ? provider.accountSidMasked ?? ""
                      : field.key === "senderId"
                        ? provider.senderId ?? ""
                        : ""
                  : undefined
            }
            defaultValue={
              provider && !field.secret
                ? field.key === "senderId"
                  ? provider.senderId ?? ""
                  : field.key === "apiBaseUrl"
                    ? provider.apiBaseUrl ?? ""
                    : undefined
                : undefined
            }

          />
          {field.help && <p className="mt-1 text-xs text-gray-500">{field.help}</p>}
        </div>
      ))}
    </>
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">SMS Providers</h1>
        <Button onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Cancel" : "Add provider"}
        </Button>
      </div>

      {feedback && (
        <div className="mb-4">
          <Alert tone={feedback.tone}>{feedback.text}</Alert>
        </div>
      )}

      {showCreate && (
        <Card className="mb-6">
          <form onSubmit={createProvider} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="p-name">Name</Label>
              <Input id="p-name" name="name" required minLength={2} placeholder="My SMS Provider" />
            </div>
            <div>
              <Label htmlFor="p-type">Type</Label>
              <Select id="p-type" value={createType} onChange={(e) => setCreateType(e.target.value)}>
                {Object.entries(types).map(([id, info]) => (
                  <option key={id} value={id}>
                    {info.label}
                  </option>
                ))}
              </Select>
              {types[createType] && (
                <p className="mt-1 text-xs text-gray-500">{types[createType].description}</p>
              )}
            </div>

            {createType === "HTTP" ? (
              <HttpConfigForm key="create-http" />
            ) : (
              types[createType] && renderBuiltinFields(types[createType])
            )}

            <div>
              <Label htmlFor="p-priority">Priority (lower = preferred)</Label>
              <Input id="p-priority" name="priority" type="number" defaultValue={100} min={1} max={1000} />
            </div>
            <div className="flex items-end gap-6 pb-1">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isActive" defaultChecked className="h-4 w-4 rounded" />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="isDefault" className="h-4 w-4 rounded" />
                Default provider
              </label>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Create provider"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="space-y-4">
        {providers.map((provider) => (
          <Card key={provider.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{provider.name}</span>
                  <Badge tone="gray">{types[provider.type]?.label ?? provider.type}</Badge>
                  {provider.isDefault && <Badge tone="indigo">Default</Badge>}
                  <Badge tone={provider.isActive ? "green" : "red"}>
                    {provider.isActive ? "Active" : "Disabled"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Priority {provider.priority}
                  {provider.senderId && <> · Sender: {provider.senderId}</>}
                  {provider.type === "HTTP" && provider.apiBaseUrl && (
                    <> · {provider.config?.method ?? "POST"} {provider.apiBaseUrl}</>
                  )}
                  {provider.accountSidMasked && provider.type !== "HTTP" && (
                    <> · SID: {provider.accountSidMasked}</>
                  )}
                  {provider.hasApiSecret && <> · Secret configured</>}
                  {provider.hasApiKey && <> · Key configured</>}
                </p>
                {testResult[provider.id] && (
                  <p
                    className={`mt-1 text-xs font-medium ${
                      testResult[provider.id].startsWith("CONNECTED")
                        ? "text-green-700"
                        : testResult[provider.id] === "Testing…"
                          ? "text-gray-500"
                          : "text-red-700"
                    }`}
                  >
                    {testResult[provider.id]}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => test(provider.id)}>
                  Test connection
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    patch(
                      provider.id,
                      { isActive: !provider.isActive },
                      provider.isActive ? "Provider disabled." : "Provider enabled.",
                    )
                  }
                >
                  {provider.isActive ? "Disable" : "Enable"}
                </Button>
                {!provider.isDefault && (
                  <Button
                    variant="secondary"
                    onClick={() => patch(provider.id, { isDefault: true }, "Default provider set.")}
                  >
                    Make default
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => setEditing(editing === provider.id ? null : provider.id)}
                >
                  {editing === provider.id ? "Close" : "Edit"}
                </Button>
                <Button variant="danger" onClick={() => remove(provider.id)}>
                  Delete
                </Button>
              </div>
            </div>

            {editing === provider.id && types[provider.type] && (
              <form
                onSubmit={(e) => saveEdit(e, provider)}
                className="mt-4 grid grid-cols-1 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2"
              >
                <div>
                  <Label htmlFor="e-name">Name</Label>
                  <Input id="e-name" name="name" defaultValue={provider.name} required />
                </div>
                <div>
                  <Label htmlFor="e-priority">Priority</Label>
                  <Input
                    id="e-priority"
                    name="priority"
                    type="number"
                    defaultValue={provider.priority}
                    min={1}
                    max={1000}
                  />
                </div>
                {provider.type === "HTTP" ? (
                  <HttpConfigForm key={`edit-${provider.id}`} provider={provider} />
                ) : (
                  renderBuiltinFields(types[provider.type], provider)
                )}
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={busy}>
                    {busy ? "Saving…" : "Save changes"}
                  </Button>
                  <p className="mt-2 text-xs text-gray-500">
                    Leave credential fields blank to keep the stored (encrypted) values.
                  </p>
                </div>
              </form>
            )}
          </Card>
        ))}
        {providers.length === 0 && <p className="text-sm text-gray-500">No providers yet.</p>}
      </div>
    </div>
  );
}
