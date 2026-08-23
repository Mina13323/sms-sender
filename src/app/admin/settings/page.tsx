"use client";

import { FormEvent, useEffect, useState } from "react";
import { Alert, Button, Card, Input, Label } from "@/components/ui";

interface Settings {
  smsRatePerMinute: number;
  smsMaxRecipients: number;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setSettings(data.settings);
      });
  }, []);

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        smsRatePerMinute: Number(form.get("smsRatePerMinute")),
        smsMaxRecipients: Number(form.get("smsMaxRecipients")),
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.success) {
      setSettings(data.settings);
      setFeedback({ tone: "success", text: "Settings saved." });
    } else {
      setFeedback({ tone: "error", text: data.message || "Save failed." });
    }
  };

  return (
    <div>
      <h1 className="mb-4 text-lg font-bold">Settings</h1>
      {feedback && (
        <div className="mb-4">
          <Alert tone={feedback.tone}>{feedback.text}</Alert>
        </div>
      )}
      <Card className="max-w-md">
        {!settings ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div>
              <Label htmlFor="s-rate">SMS requests per user per minute</Label>
              <Input
                id="s-rate"
                name="smsRatePerMinute"
                type="number"
                min={1}
                max={1000}
                defaultValue={settings.smsRatePerMinute}
              />
            </div>
            <div>
              <Label htmlFor="s-max">Max recipients per request</Label>
              <Input
                id="s-max"
                name="smsMaxRecipients"
                type="number"
                min={1}
                max={100}
                defaultValue={settings.smsMaxRecipients}
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save settings"}
            </Button>
          </form>
        )}
      </Card>
      <p className="mt-6 max-w-md text-xs text-gray-400">
        Privacy: this platform never stores or logs recipient numbers, message content or contact
        lists. Only aggregate counters and platform configuration are persisted.
      </p>
    </div>
  );
}
