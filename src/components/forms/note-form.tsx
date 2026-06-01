"use client";

import { useState, useTransition } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { addNote } from "@/lib/actions/invoices";

export function NoteForm({
  invoiceId,
  onDone,
}: {
  invoiceId: string;
  onDone: () => void;
}) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addNote({ entityType: "invoice", entityId: invoiceId, body });
          if (!r.ok) setErr(r.error);
          else {
            setBody("");
            setErr(null);
            onDone();
          }
        });
      }}
      className="space-y-2"
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Adicionar nota…"
        rows={3}
      />
      {err && <p className="text-xs text-destructive">{err}</p>}
      <Button type="submit" size="sm" loading={pending} disabled={pending || !body.trim()}>
        Salvar nota
      </Button>
    </form>
  );
}
