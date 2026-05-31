"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilterOption = { value: string; label: string };

export function FilterDropdown({
  label,
  icon: Icon,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  icon?: LucideIcon;
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const labelFor = (value: string) =>
    options.find((o) => o.value === value)?.label ?? value;

  return (
    <div className="flex items-center gap-2" ref={ref}>
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex h-8 w-36 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-sm",
            selected.length > 0 ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
          {label}
          <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0" />
        </button>

        {open && (
          <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-md border border-border bg-popover p-1 shadow-md">
            {options.map((opt) => {
              const active = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => onToggle(opt.value)}
                  className={cn(
                    "flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-accent",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {opt.label}
                  {active && <Check className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected values shown horizontally in front of the filter */}
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {selected.map((value) => (
            <button
              key={value}
              onClick={() => onToggle(value)}
              className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground hover:bg-muted/70"
            >
              {labelFor(value)}
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          ))}
          <button
            onClick={onClear}
            className="px-1 text-xs text-muted-foreground hover:text-foreground"
          >
            limpar
          </button>
        </div>
      )}
    </div>
  );
}
