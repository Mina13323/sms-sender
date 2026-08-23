"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";

interface Stats {
  users: { total: number; active: number };
  providers: { total: number; active: number };
  routes: { total: number; active: number };
  usageLast30Days: { messages: number; segments: number; failed: number };
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
      <p className="mt-6 text-xs text-gray-400">
        Usage counters are aggregates only — no message content or recipient data is stored.
      </p>
    </div>
  );
}
