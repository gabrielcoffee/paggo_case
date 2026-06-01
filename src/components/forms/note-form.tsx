"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

// Dumb input: emits the note body to the parent, which applies it optimistically
// and fires the write in the background. Clears instantly — never waits on the DB.
export function NoteForm({ onAdd }: { onAdd: (body: string) => void }) {
  const [body, setBody] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = body.trim();
        if (!trimmed) return;
        onAdd(trimmed);
        setBody("");
      }}
      className="space-y-2"
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Adicionar nota…"
        rows={3}
      />
      <Button type="submit" size="sm" disabled={!body.trim()}>
        Salvar nota
      </Button>
    </form>
  );
}
