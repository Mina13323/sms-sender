"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Input, Label, Select } from "@/components/ui";

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
  hasApiSecret: boolean;
}

export default function AdminProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [types, setTypes] = useState<Record<string, ProviderTypeInfo>>({});
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState("TWILIO");
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
    const res = await fetch("/api/admin/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        type: createType,
        priority: Number(form.get("priority") || 100),
        isActive: form.get("isActive") === "on",
        isDefault: form.get("isDefault") === "on",
        ...collectFields(form, typeInfo),
      }),
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
    const res = await fetch(`/api/admin/providers/${provider.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        priority: Number(form.get("priority") || provider.priority),
        ...collectFields(form, typeInfo),
      }),
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

  const renderFields = (typeInfo: ProviderTypeInfo, provider?: Provider) => (
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
              provider
                ? field.secret
                  ? provider.hasApiSecret
                    ? "•••••• (leave blank to keep)"
                    : ""
                  : field.key === "accountSid"
                    ? provider.accountSidMasked ?? ""
                    : field.key === "senderId"
                      ? provider.senderId ?? ""
                      : field.key === "apiBaseUrl"
                        ? provider.apiBaseUrl ?? ""
                        : ""
                : undefined
            }
            defaultValue={
              provider && !field.secret && field.key === "senderId"
                ? provider.senderId ?? ""
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
              <Input id="p-name" name="name" required minLength={2} placeholder="Twilio main account" />
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
            {types[createType] && renderFields(types[createType])}
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
                  {provider.accountSidMasked && <> · SID: {provider.accountSidMasked}</>}
                  {provider.hasApiSecret && <> · Secret configured</>}
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
                {renderFields(types[provider.type], provider)}
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
