"use client";

import { useState } from "react";
import { ChevronRight, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TraceEntry } from "@/lib/agent/loop";

export function ToolTrace({ trace }: { trace: TraceEntry[] }) {
  const [open, setOpen] = useState(false);
  if (!trace || trace.length === 0) return null;
  return (
    <div className="text-xs text-muted-foreground">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 hover:text-foreground"
      >
        <ChevronRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} />
        <Wrench className="h-3 w-3" /> {trace.length} ferramenta(s)
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 border-l border-border pl-3 font-mono">
          {trace.map((t, i) => (
            <li key={i} className={t.isError ? "text-destructive" : ""}>
              {t.name}({JSON.stringify(t.input).slice(0, 120)})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
