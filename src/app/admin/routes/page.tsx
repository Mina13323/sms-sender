"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Input, Label, Select } from "@/components/ui";

interface Route {
  id: string;
  country: string;
  countryCode: string | null;
  carrier: string;
  providerId: string;
  providerName: string | null;
  senderId: string | null;
  pricePerSegment: number;
  currency: string;
  priority: number;
  isActive: boolean;
}

interface ProviderOption {
  id: string;
  name: string;
  isActive: boolean;
}

export default function AdminRoutesPage() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Route | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [routesRes, providersRes] = await Promise.all([
      fetch("/api/admin/routes").then((r) => r.json()),
      fetch("/api/admin/providers").then((r) => r.json()),
    ]);
    if (routesRes.success) setRoutes(routesRes.routes);
    if (providersRes.success) setProviders(providersRes.providers);
  }, []);

  useEffect(() => {
    // Defer to a microtask so state updates never happen synchronously in the effect.
    void Promise.resolve().then(load);
  }, [load]);

  const submitRoute = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    const form = new FormData(e.currentTarget);
    const body = {
      country: form.get("country"),
      countryCode: form.get("countryCode") || "",
      carrier: form.get("carrier"),
      providerId: form.get("providerId"),
      senderId: form.get("senderId") || "",
      pricePerSegment: Number(form.get("pricePerSegment")),
      currency: String(form.get("currency") || "USD"),
      priority: Number(form.get("priority") || 100),
      isActive: form.get("isActive") === "on",
    };
    const url = editing ? `/api/admin/routes/${editing.id}` : "/api/admin/routes";
    const res = await fetch(url, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);
    if (data.success) {
      setFeedback({ tone: "success", text: editing ? "Route updated." : "Route created." });
      setShowCreate(false);
      setEditing(null);
      load();
    } else {
      setFeedback({ tone: "error", text: data.message || "Save failed." });
    }
  };

  const toggleActive = async (route: Route) => {
    const res = await fetch(`/api/admin/routes/${route.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !route.isActive }),
    });
    const data = await res.json();
    if (data.success) load();
    else setFeedback({ tone: "error", text: data.message || "Update failed." });
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this route?")) return;
    const res = await fetch(`/api/admin/routes/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) load();
    else setFeedback({ tone: "error", text: data.message || "Delete failed." });
  };

  const formVisible = showCreate || editing !== null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">SMS Routes & Pricing</h1>
        <Button
          onClick={() => {
            setEditing(null);
            setShowCreate((v) => !v);
          }}
        >
          {formVisible ? "Cancel" : "Add route"}
        </Button>
      </div>

      {feedback && (
        <div className="mb-4">
          <Alert tone={feedback.tone}>{feedback.text}</Alert>
        </div>
      )}

      {formVisible && (
        <Card className="mb-6">
          <h2 className="mb-3 text-sm font-semibold">{editing ? "Edit route" : "New route"}</h2>
          <form
            key={editing?.id ?? "new"}
            onSubmit={submitRoute}
            className="grid grid-cols-1 gap-4 sm:grid-cols-3"
          >
            <div>
              <Label htmlFor="r-country">Country</Label>
              <Input id="r-country" name="country" required defaultValue={editing?.country} placeholder="Senegal" />
            </div>
            <div>
              <Label htmlFor="r-code">Dial prefix (optional)</Label>
              <Input id="r-code" name="countryCode" defaultValue={editing?.countryCode ?? ""} placeholder="+221" />
            </div>
            <div>
              <Label htmlFor="r-carrier">Carrier / Network</Label>
              <Input id="r-carrier" name="carrier" required defaultValue={editing?.carrier} placeholder="Tigo" />
            </div>
            <div>
              <Label htmlFor="r-provider">Provider</Label>
              <Select id="r-provider" name="providerId" required defaultValue={editing?.providerId}>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.isActive ? "" : "(disabled)"}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="r-sender">Sender / CLI (optional)</Label>
              <Input id="r-sender" name="senderId" defaultValue={editing?.senderId ?? ""} placeholder="Provider default" />
            </div>
            <div>
              <Label htmlFor="r-price">Price per segment</Label>
              <Input
                id="r-price"
                name="pricePerSegment"
                type="number"
                step="0.0001"
                min="0"
                required
                defaultValue={editing?.pricePerSegment}
                placeholder="0.004"
              />
            </div>
            <div>
              <Label htmlFor="r-currency">Currency</Label>
              <Input id="r-currency" name="currency" defaultValue={editing?.currency ?? "USD"} maxLength={3} />
            </div>
            <div>
              <Label htmlFor="r-priority">Priority</Label>
              <Input id="r-priority" name="priority" type="number" min={1} max={1000} defaultValue={editing?.priority ?? 100} />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="isActive"
                  defaultChecked={editing?.isActive ?? true}
                  className="h-4 w-4 rounded"
                />
                Active
              </label>
            </div>
            <div className="sm:col-span-3">
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : editing ? "Save changes" : "Create route"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3">Carrier</th>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">Sender</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((route) => (
              <tr key={route.id} className="border-b border-gray-100 last:border-b-0">
                <td className="px-4 py-3 font-medium">
                  {route.country}
                  {route.countryCode && (
                    <span className="ml-1 text-xs text-gray-400">{route.countryCode}</span>
                  )}
                </td>
                <td className="px-4 py-3">{route.carrier}</td>
                <td className="px-4 py-3 text-gray-600">{route.providerName}</td>
                <td className="px-4 py-3 text-gray-600">{route.senderId || "—"}</td>
                <td className="px-4 py-3">
                  {route.pricePerSegment} {route.currency}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={route.isActive ? "green" : "red"}>
                    {route.isActive ? "Active" : "Disabled"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => toggleActive(route)}>
                      {route.isActive ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setShowCreate(false);
                        setEditing(route);
                      }}
                    >
                      Edit
                    </Button>
                    <Button variant="danger" onClick={() => remove(route.id)}>
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {routes.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  No routes configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
