"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";

export type FollowUpInput = {
  dueAt: string;
  channel: "phone" | "email" | "whatsapp";
  body: string;
};

const CHANNELS = [
  { value: "phone", label: "Telefone" },
  { value: "email", label: "E-mail" },
  { value: "whatsapp", label: "WhatsApp" },
];

const inputCls =
  "h-8 rounded-md border border-input bg-background px-2.5 text-sm outline-none ring-ring/40 focus:ring-2";

// Dumb input: emits the follow-up to the parent (optimistic + background write).
export function FollowUpForm({ onAdd }: { onAdd: (input: FollowUpInput) => void }) {
  const [dueAt, setDueAt] = useState("");
  const [channel, setChannel] = useState("phone");
  const [body, setBody] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = body.trim();
        if (!dueAt || !trimmed) return;
        onAdd({
          dueAt: new Date(dueAt).toISOString(),
          channel: channel as FollowUpInput["channel"],
          body: trimmed,
        });
        setDueAt("");
        setBody("");
      }}
      className="space-y-2"
    >
      <div className="flex gap-2">
        <div className="flex-1">
          <DatePicker
            value={dueAt}
            onChange={setDueAt}
            withTime
            placeholder="Data e hora"
          />
        </div>
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
      <Button type="submit" size="sm" disabled={!dueAt || !body.trim()}>
        Agendar follow-up
      </Button>
    </form>
  );
}
