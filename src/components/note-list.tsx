"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { IconBtn } from "@/components/icon-button";
import { updateNote, deleteNote } from "@/lib/actions/invoices";
import { dateTime } from "@/lib/format";
import type { DetailNote } from "@/lib/actions/invoice-detail";

// Reusable note list with inline edit + delete. Works for any entity (invoice or
// customer) since updateNote/deleteNote operate by note id.
export function NoteList({ notes, onDone }: { notes: DetailNote[]; onDone: () => void }) {
  if (notes.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem notas ainda.</p>;
  }
  return (
    <ul className="space-y-3">
      {notes.map((n) => (
        <NoteItem key={n.id} note={n} onDone={onDone} />
      ))}
    </ul>
  );
}

function NoteItem({ note, onDone }: { note: DetailNote; onDone: () => void }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const [pending, start] = useTransition();

  if (editing) {
    return (
      <li className="rounded-lg border border-border p-3">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            loading={pending}
            disabled={pending || !body.trim()}
            onClick={() =>
              start(async () => {
                const r = await updateNote({ noteId: note.id, body });
                if (r.ok) {
                  setEditing(false);
                  onDone();
                }
              })
            }
          >
            Salvar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setBody(note.body);
              setEditing(false);
            }}
          >
            Cancelar
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="whitespace-pre-wrap text-sm">{note.body}</p>
        <div className="flex shrink-0 gap-0.5">
          <IconBtn label="Editar nota" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn
            label="Excluir nota"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await deleteNote(note.id);
                if (r.ok) onDone();
              })
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {note.author} · {dateTime(note.createdAt)}
      </p>
    </li>
  );
}
