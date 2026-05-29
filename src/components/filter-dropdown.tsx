"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type Option = { value: string; label: string };

// A filter pill that reveals its options in a popover on click. Opening is a
// deliberate action (click); leaving the popover with the mouse closes it. The
// reveal is animated (~150ms) so it never feels like a hard cut.
export function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const count = selected.length;

  return (
    <div
      className="relative"
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
          count > 0
            ? "border-primary bg-primary/10 text-primary"
            : "border-input bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary",
        )}
      >
        {label}
        {count > 0 && (
          <span className="rounded-full bg-primary px-1.5 font-mono text-[10px] font-semibold text-primary-foreground tabular-nums">
            {count}
          </span>
        )}
        {open ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>

      <div
        className={cn(
          "absolute left-0 top-full z-20 mt-1 min-w-44 origin-top rounded-lg border border-border bg-card p-1.5 shadow-lg transition duration-150 ease-out",
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-1 scale-95 opacity-0",
        )}
      >
        <div className="flex flex-col gap-0.5">
          {options.map((o) => {
            const active = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => onToggle(o.value)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-primary/5 hover:text-primary",
                )}
              >
                <span
                  className={cn(
                    "flex h-3.5 w-3.5 items-center justify-center rounded border",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input",
                  )}
                >
                  {active && (
                    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none">
                      <path
                        d="M2.5 6.5 5 9l4.5-5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                {o.label}
              </button>
            );
          })}
        </div>
        {count > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="mt-1 w-full rounded-md px-2 py-1 text-left text-[11px] text-muted-foreground hover:text-foreground"
          >
            Limpar {label.toLowerCase()}
          </button>
        )}
      </div>
    </div>
  );
}
