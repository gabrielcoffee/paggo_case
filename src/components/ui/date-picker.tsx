"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

function parseValue(value: string, withTime: boolean): Date | null {
  if (!value) return null;
  const d = withTime ? new Date(value) : parseISO(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Lightweight calendar picker (no extra deps) used instead of the native, ugly
// date inputs. `withTime` adds a time field and emits `yyyy-MM-ddTHH:mm`; date-only
// emits `yyyy-MM-dd`.
export function DatePicker({
  value,
  onChange,
  withTime = false,
  placeholder = "Selecionar data",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  withTime?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = parseValue(value, withTime);
  const [month, setMonth] = useState<Date>(selected ?? new Date());

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const time = selected ? format(selected, "HH:mm") : "09:00";

  function pickDay(day: Date) {
    if (withTime) {
      const [h, m] = time.split(":").map(Number);
      const next = new Date(day);
      next.setHours(h || 0, m || 0, 0, 0);
      onChange(format(next, "yyyy-MM-dd'T'HH:mm"));
    } else {
      onChange(format(day, "yyyy-MM-dd"));
      setOpen(false);
    }
  }

  function changeTime(t: string) {
    const base = selected ?? new Date();
    const [h, m] = t.split(":").map(Number);
    const next = new Date(base);
    next.setHours(h || 0, m || 0, 0, 0);
    onChange(format(next, "yyyy-MM-dd'T'HH:mm"));
  }

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const label = selected
    ? format(selected, withTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy")
    : placeholder;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm outline-none ring-ring/40 focus:ring-2",
          !selected && "text-muted-foreground",
          className,
        )}
      >
        <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
        {label}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-border bg-popover p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMonth(addMonths(month, -1))}
              className="rounded p-1 hover:bg-accent"
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium capitalize">
              {format(month, "MMMM yyyy", { locale: ptBR })}
            </span>
            <button
              type="button"
              onClick={() => setMonth(addMonths(month, 1))}
              className="rounded p-1 hover:bg-accent"
              aria-label="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] text-muted-foreground">
            {WEEKDAYS.map((w, i) => (
              <span key={i} className="py-1">
                {w}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {days.map((d) => {
              const isSel = selected != null && isSameDay(d, selected);
              const out = !isSameMonth(d, month);
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => pickDay(d)}
                  className={cn(
                    "h-8 rounded text-sm hover:bg-accent",
                    out && "text-muted-foreground/40",
                    isSel && "bg-primary text-primary-foreground hover:bg-primary",
                  )}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {withTime && (
            <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
              <span className="text-xs text-muted-foreground">Hora</span>
              <input
                type="time"
                value={time}
                onChange={(e) => changeTime(e.target.value)}
                className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm outline-none ring-ring/40 focus:ring-2"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
              >
                OK
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
