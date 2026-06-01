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
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
const selectCls =
  "h-8 rounded-md border border-input bg-background px-2 text-sm outline-none ring-ring/40 focus:ring-2";

function parseValue(value: string, withTime: boolean): Date | null {
  if (!value) return null;
  const d = withTime ? new Date(value) : parseISO(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Lightweight calendar picker (no extra deps). `withTime` adds hour/minute selects
// and emits `yyyy-MM-ddTHH:mm`; date-only emits `yyyy-MM-dd`. The popover flips
// above the trigger when there isn't room below.
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
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = parseValue(value, withTime);
  const [month, setMonth] = useState<Date>(selected ?? new Date());

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function toggle() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const needed = withTime ? 380 : 330;
      setDropUp(window.innerHeight - rect.bottom < needed && rect.top > needed);
    }
    setOpen((o) => !o);
  }

  const time = selected ? format(selected, "HH:mm") : "09:00";
  const [hh, mm] = time.split(":");
  const minuteOpts = MINUTES.includes(mm) ? MINUTES : [...MINUTES, mm].sort();

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

  function setTimePart(h: string, m: string) {
    const base = selected ?? new Date(new Date().setHours(9, 0, 0, 0));
    const next = new Date(base);
    next.setHours(Number(h), Number(m), 0, 0);
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
        ref={triggerRef}
        type="button"
        onClick={toggle}
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
        <div
          className={cn(
            "absolute left-0 z-30 w-64 rounded-lg border border-border bg-popover p-3 shadow-lg",
            dropUp ? "bottom-full mb-1" : "top-full mt-1",
          )}
        >
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
              <select
                value={hh}
                onChange={(e) => setTimePart(e.target.value, mm)}
                className={selectCls}
                aria-label="Hora"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <span className="text-muted-foreground">:</span>
              <select
                value={mm}
                onChange={(e) => setTimePart(hh, e.target.value)}
                className={selectCls}
                aria-label="Minuto"
              >
                {minuteOpts.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ml-auto rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
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
