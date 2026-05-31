"use client";

import { useState, useTransition } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { scheduleFollowUp } from "@/lib/actions/invoices";

const CHANNELS = [
  { value: "phone", label: "Telefone" },
  { value: "email", label: "E-mail" },
  { value: "whatsapp", label: "WhatsApp" },
];

const inputCls =
  "h-8 rounded-md border border-input bg-background px-2.5 text-sm outline-none ring-ring/40 focus:ring-2";

export function FollowUpForm({
  invoiceId,
  onDone,
}: {
  invoiceId: string;
  onDone: () => void;
}) {
  const [dueAt, setDueAt] = useState("");
  const [channel, setChannel] = useState("phone");
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const iso = dueAt ? new Date(dueAt).toISOString() : "";
        start(async () => {
          const r = await scheduleFollowUp({
            entityType: "invoice",
            entityId: invoiceId,
            dueAt: iso,
            channel: channel as "phone" | "email" | "whatsapp",
            body,
          });
          if (!r.ok) setErr(r.error);
          else {
            setDueAt("");
            setBody("");
            setErr(null);
            onDone();
          }
        });
      }}
      className="space-y-2"
    >
      <div className="flex gap-2">
        <input
          type="datetime-local"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className={inputCls + " flex-1"}
        />
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className={inputCls}
        >
          {CHANNELS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Objetivo do follow-up…"
        rows={2}
      />
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Button type="submit" size="sm" disabled={pending || !dueAt || !body.trim()}>
        Agendar follow-up
      </Button>
    </form>
  );
}
