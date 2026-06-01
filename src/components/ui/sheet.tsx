"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { usePanelWidth } from "@/lib/use-panel-width";
import { PanelResizeHandle } from "@/components/panel-resize-handle";

// Right-side sliding panel. Hand-rolled (no shadcn sheet in base-nova). The list
// stays mounted and scrollable behind it. Closes on Escape or the X button.
// Width is resizable via the left-edge handle and persisted (shared across panels).
export function Sheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { width, setWidth } = usePanelWidth();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <aside
      role="dialog"
      aria-label="Painel de detalhe"
      style={{ width, maxWidth: "100vw" }}
      className={cn(
        "fixed right-0 top-0 z-50 flex h-screen flex-col border-l border-border bg-card shadow-2xl transition-transform duration-200 ease-out",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
      <PanelResizeHandle onResize={(x) => setWidth(window.innerWidth - x)} />
      {children}
    </aside>
  );
}
