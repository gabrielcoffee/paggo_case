"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { IconBtn } from "@/components/icon-button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { dateTime } from "@/lib/format";
import type { DetailNote } from "@/lib/actions/invoice-detail";

// Reusable note list. Edit/delete are optional — omit the handlers for a
// read-only list (e.g. customer notes). Handlers operate by note id.
export function NoteList({
  notes,
  onUpdate,
  onDelete,
}: {
  notes: DetailNote[];
  onUpdate?: (id: string, body: string) => void;
  onDelete?: (id: string) => void;
}) {
  if (notes.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem notas ainda.</p>;
  }
  return (
    <ul className="space-y-3">
      {notes.map((n) => (
        <NoteItem key={n.id} note={n} onUpdate={onUpdate} onDelete={onDelete} />
      ))}
    </ul>
  );
}

function NoteItem({
  note,
  onUpdate,
  onDelete,
}: {
  note: DetailNote;
  onUpdate?: (id: string, body: string) => void;
  onDelete?: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const confirm = useConfirm();

  if (editing && onUpdate) {
    return (
      <li className="rounded-lg border border-border p-3">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            disabled={!body.trim()}
            onClick={() => {
              const trimmed = body.trim();
              if (!trimmed) return;
              onUpdate(note.id, trimmed);
              setEditing(false);
            }}
          >
            Salvar
          </Button>
          <Button
            size="sm"
            variant="ghost"
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
        {(onUpdate || onDelete) && (
          <div className="flex shrink-0 gap-0.5">
            {onUpdate && (
              <IconBtn label="Editar nota" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
              </IconBtn>
            )}
            {onDelete && (
              <IconBtn
                label="Excluir nota"
                onClick={async () => {
                  if (await confirm({ title: "Excluir nota", description: "Excluir esta nota? Esta ação não pode ser desfeita." }))
                    onDelete(note.id);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </IconBtn>
            )}
          </div>
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {note.author} · {dateTime(note.createdAt)}
      </p>
    </li>
  );
}
