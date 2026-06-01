"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

// Number field with custom −/+ steppers (no native spinners). Text is the
// display source so the user can clear it; leading zeros are stripped on input
// and focusing selects all, so a lone "0" is replaced by the first keystroke.
export function NumberInput({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  className,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  const [text, setText] = useState(String(value));

  const clamp = (n: number) => {
    let v = n;
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    return v;
  };

  function commit(n: number) {
    const c = clamp(n);
    setText(String(c));
    onChange(c);
  }

  function handleText(raw: string) {
    const cleaned = raw.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
    setText(cleaned);
    if (cleaned === "") onChange(min ?? 0);
    else onChange(clamp(Number(cleaned)));
  }

  return (
    <div className={cn("flex h-9 items-stretch rounded-md border border-input bg-background", className)}>
      <button
        type="button"
        onClick={() => commit(value - step)}
        disabled={min != null && value <= min}
        className="flex w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        aria-label="Diminuir"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        inputMode="numeric"
        value={text}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => handleText(e.target.value)}
        onBlur={() => {
          if (text === "") commit(min ?? 0);
        }}
        className="w-full min-w-0 border-x border-input bg-transparent px-2 text-center text-sm tabular-nums outline-none"
      />
      <button
        type="button"
        onClick={() => commit(value + step)}
        disabled={max != null && value >= max}
        className="flex w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        aria-label="Aumentar"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
