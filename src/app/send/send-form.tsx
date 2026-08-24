"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { countSegments } from "@/lib/segments";
import { parseRecipients, suggestE164 } from "@/lib/phone";
import { Alert, Button, Card, Label, Select, Textarea } from "@/components/ui";

interface RouteOption {
  id: string;
  country: string;
  carrier: string;
  pricePerSegment: number;
  currency: string;
}

interface ErrorHint {
  title: string;
  hint: string;
}

interface PerRecipientResult {
  to: string;
  success: boolean;
  status: string;
  providerMessageId?: string;
  errorCode?: string;
  errorHint?: ErrorHint;
}

export function SendForm() {
  const [recipients, setRecipients] = useState("");
  const [message, setMessage] = useState("");
  const [routeId, setRouteId] = useState("");
  const [consent, setConsent] = useState(false);
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [feedback, setFeedback] = useState("");
  const [results, setResults] = useState<PerRecipientResult[]>([]);
  const [viaProvider, setViaProvider] = useState<{ name: string; type: string } | null>(null);

  const inFlight = useRef(false);

  useEffect(() => {
    fetch("/api/routes")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.success) setRoutes(data.routes);
      })
      .catch(() => undefined);
  }, []);

  const seg = useMemo(() => countSegments(message), [message]);
  const parsed = useMemo(() => parseRecipients(recipients), [recipients]);
  const selectedRoute = routes.find((r) => r.id === routeId);
  const estimatedCost =
    selectedRoute && parsed.valid.length > 0 && seg.segments > 0
      ? (selectedRoute.pricePerSegment * seg.segments * parsed.valid.length).toFixed(4)
      : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return; // repeated-click protection
    inFlight.current = true;
    setStatus("loading");
    setFeedback("");
    setResults([]);
    setViaProvider(null);


    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients,
          message,
          routeId: routeId || null,
          consent,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus("success");
        setFeedback(data.message || "SMS submitted successfully.");
        setResults(data.results ?? []);
        setViaProvider(data.provider ?? null);
        setMessage("");
        setRecipients("");
        setConsent(false);
      } else {
        setStatus("error");
        setFeedback(data.message || "Unable to send SMS. Please try again.");
        setResults(data.results ?? []);
        setViaProvider(data.provider ?? null);
      }

    } catch {
      setStatus("error");
      setFeedback("Unable to send SMS. Please try again.");
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <Card>
      <form onSubmit={submit} className="space-y-5">
        {status === "success" && <Alert tone="success">{feedback}</Alert>}
        {status === "error" && <Alert tone="error">{feedback}</Alert>}
        {viaProvider && (
          <p className="text-xs text-gray-500">
            Handled by provider: <span className="font-medium">{viaProvider.name}</span> (
            {viaProvider.type})
          </p>
        )}
        {viaProvider?.type === "MOCK" && (
          <Alert tone="info">
            This send was handled by the <strong>Mock provider</strong> — no real SMS was
            transmitted. An administrator should deactivate Mock or set a real provider as
            default.
          </Alert>
        )}


        {results.length > 0 && (
          <div className="space-y-3 rounded-md border border-gray-200 p-3 text-sm">
            {results.map((r) => (
              <div key={r.to} className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs">{r.to}</span>
                  <span
                    className={
                      r.success
                        ? "rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700"
                        : "rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700"
                    }
                  >
                    {r.success ? r.status : "failed"}
                  </span>
                </div>
                {r.success && r.providerMessageId && (
                  <p className="text-xs text-gray-500">
                    Provider message ID:{" "}
                    <span className="font-mono select-all">{r.providerMessageId}</span>
                    {r.status === "delivered" ? (
                      <span className="text-green-600"> · delivered</span>
                    ) : (
                      <span className="text-gray-400">
                        {" "}
                        · delivery confirmed later by the provider
                      </span>
                    )}
                  </p>
                )}
                {!r.success && (r.errorHint || r.errorCode) && (
                  <p className="text-xs text-red-600">
                    {r.errorHint ? (
                      <>
                        <span className="font-semibold">{r.errorHint.title}.</span>{" "}
                        {r.errorHint.hint}
                      </>
                    ) : (
                      <>Error code: {r.errorCode}</>
                    )}
                  </p>
                )}
              </div>
            ))}
            <p className="text-xs text-gray-400">
              &ldquo;Submitted&rdquo; means the provider accepted the message into its queue — it is
              not yet proof of delivery. Final delivery is reported by the provider and shown on the
              admin dashboard.
            </p>
          </div>
        )}

        <div>
          <Label htmlFor="recipients">Recipient phone number(s)</Label>
          <Textarea
            id="recipients"
            rows={2}
            required
            value={recipients}
            onChange={(e) => setRecipients(e.target.value)}
            placeholder={"+221771234567\n+974312345678"}
          />
          <p className="mt-1 text-xs text-gray-500">
            International format (+countrycode…), one per line or comma separated.
            {parsed.valid.length > 0 && ` ${parsed.valid.length} valid recipient(s).`}
          </p>
          {parsed.invalid.length > 0 && (
            <div className="mt-1 space-y-0.5 text-xs">
              {parsed.invalid.map((entry) => {
                const suggestion = suggestE164(entry);
                return (
                  <p key={entry} className="text-red-600">
                    <span className="font-mono">{entry}</span> is invalid —{" "}
                    {suggestion ? (
                      <>
                        did you mean{" "}
                        <button
                          type="button"
                          className="font-mono font-semibold underline hover:text-red-800"
                          onClick={() =>
                            setRecipients((prev) => prev.replace(entry, suggestion))
                          }
                        >
                          {suggestion}
                        </button>
                        ? Click to fix.
                      </>
                    ) : (
                      <>must start with + and a country code (e.g. +14155550199).</>
                    )}
                  </p>
                );
              })}
            </div>
          )}

        </div>

        <div>
          <Label htmlFor="message">Message</Label>
          <Textarea
            id="message"
            rows={4}
            required
            maxLength={1600}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message…"
          />
          <p className="mt-1 text-xs text-gray-500">
            {message.length} characters · {seg.encoding} · Estimated segments: {seg.segments}
          </p>
        </div>

        {routes.length > 0 && (
          <div>
            <Label htmlFor="route">Route (optional)</Label>
            <Select id="route" value={routeId} onChange={(e) => setRouteId(e.target.value)}>
              <option value="">Automatic (default provider)</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.country} / {r.carrier} — {r.pricePerSegment} {r.currency}/segment
                </option>
              ))}
            </Select>
            {estimatedCost && (
              <p className="mt-1 text-xs text-gray-500">
                Estimated cost: {estimatedCost} {selectedRoute?.currency}
              </p>
            )}
          </div>
        )}

        <label className="flex items-start gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            required
          />
          I confirm the recipients have consented to receive this message.
        </label>

        <Button
          type="submit"
          disabled={status === "loading" || parsed.valid.length === 0 || !message.trim()}
          className="w-full"
        >
          {status === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
          {status === "loading" ? "Sending…" : "Send"}
        </Button>
      </form>
    </Card>
  );
}
