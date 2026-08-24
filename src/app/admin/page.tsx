"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";

interface Stats {
  users: { total: number; active: number };
  providers: { total: number; active: number };
  routes: { total: number; active: number };
  usageLast30Days: { messages: number; segments: number; failed: number };
  deliveryLast30Days: { tracked: number; delivered: number; undelivered: number; failed: number };
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setStats(data.stats);
        else setError(data.message || "Failed to load statistics.");
      })
      .catch(() => setError("Failed to load statistics."));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!stats) return <p className="text-sm text-gray-500">Loading…</p>;

  const items = [
    { label: "Users", value: stats.users.total, sub: `${stats.users.active} active · ${stats.users.total - stats.users.active} disabled` },
    { label: "Providers", value: stats.providers.total, sub: `${stats.providers.active} active` },
    { label: "Routes", value: stats.routes.total, sub: `${stats.routes.active} active` },
    {
      label: "Messages (30 days)",
      value: stats.usageLast30Days.messages,
      sub: `${stats.usageLast30Days.segments} segments · ${stats.usageLast30Days.failed} failed`,
    },
  ];

  const d = stats.deliveryLast30Days;
  const deliveryRate = d.tracked > 0 ? Math.round((d.delivered / d.tracked) * 100) : null;

  return (
    <div>
      <h1 className="mb-4 text-lg font-bold">Dashboard</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <Card key={item.label}>
            <p className="text-sm text-gray-500">{item.label}</p>
            <p className="mt-1 text-2xl font-bold">{item.value}</p>
            <p className="mt-1 text-xs text-gray-500">{item.sub}</p>
          </Card>
        ))}
      </div>

      <h2 className="mb-2 mt-8 text-base font-semibold">Delivery (last 30 days)</h2>
      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500">Delivered</p>
            <p className="text-2xl font-bold text-green-600">
              {deliveryRate !== null ? `${deliveryRate}%` : "—"}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-lg font-bold">{d.delivered}</p>
              <p className="text-xs text-gray-500">delivered</p>
            </div>
            <div>
              <p className="text-lg font-bold text-amber-600">{d.undelivered}</p>
              <p className="text-xs text-gray-500">undelivered</p>
            </div>
            <div>
              <p className="text-lg font-bold text-red-600">{d.failed}</p>
              <p className="text-xs text-gray-500">failed</p>
            </div>
          </div>
        </div>
        {d.tracked === 0 ? (
          <p className="mt-3 text-xs text-gray-400">
            No delivery callbacks received yet. Set <code className="font-mono">APP_PUBLIC_BASE_URL</code>{" "}
            and ensure the Twilio provider is reachable so status callbacks can be recorded.
          </p>
        ) : (
          <p className="mt-3 text-xs text-gray-400">
            Out of {d.tracked} tracked {d.tracked === 1 ? "message" : "messages"}. Provider reports
            the final delivery outcome — recipient numbers and content are never stored.
          </p>
        )}
      </Card>

      <p className="mt-6 text-xs text-gray-400">
        Usage counters are aggregates only — no message content or recipient data is stored.
      </p>
    </div>
  );
}
