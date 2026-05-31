"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

// Right-side sliding panel. Hand-rolled (no shadcn sheet in base-nova) using the
// same transition approach as filter-dropdown. The list stays mounted and
// scrollable behind it. Closes on Escape or overlay click.
export function Sheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Non-modal: no overlay, so the invoice list behind stays scrollable and the
  // analyst can click another row (which swaps the panel's contents). Closes via
  // the X button or Escape.
  return (
    <aside
      role="dialog"
      aria-label="Detalhe da fatura"
      className={cn(
        "fixed right-0 top-0 z-50 flex h-screen w-full max-w-[480px] flex-col border-l border-border bg-card shadow-2xl transition-transform duration-200 ease-out",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
      {children}
    </aside>
  );
}
