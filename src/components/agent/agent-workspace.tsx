"use client";

import { useState } from "react";
import { AgentChat } from "@/components/agent/agent-chat";
import { InvoiceDetailPanel } from "@/components/invoice-detail-panel";
import { CustomerDetailPanel } from "@/components/customer-detail-panel";
import { PanelResizeHandle } from "@/components/panel-resize-handle";
import { usePanelWidth } from "@/lib/use-panel-width";
import { prefetchDetail } from "@/lib/detail-cache";
import { prefetchCustomer } from "@/lib/customer-detail-cache";
import { cn } from "@/lib/utils";
import type { PanelTab } from "@/components/invoice-detail-panel";

type Selection = { kind: "invoice" | "customer"; id: string; tab?: PanelTab } | null;

// Splits the agent screen: chat on the left (shrinks), a detail panel on the right
// when the analyst clicks an invoice/customer row in a chat answer. The panel
// animates in on open and out on close.
export function AgentWorkspace({ today }: { today: string }) {
  const [sel, setSel] = useState<Selection>(null);
  const [closing, setClosing] = useState(false);
  const { width, setWidth } = usePanelWidth();

  function open(next: Exclude<Selection, null>) {
    if (next.kind === "invoice") prefetchDetail(next.id);
    else prefetchCustomer(next.id);
    setClosing(false);
    setSel(next);
  }

  // Play the exit animation, then unmount (so the chat reflows to full width).
  function close() {
    setClosing(true);
    setTimeout(() => {
      setSel(null);
      setClosing(false);
    }, 180);
  }

  return (
    <div className="flex h-screen">
      <AgentChat onSelect={open} />
      {sel && (
        <aside
          style={{ width, maxWidth: "100vw" }}
          className={cn(
            "relative flex h-screen shrink-0 flex-col border-l border-border bg-card duration-200",
            closing ? "animate-out slide-out-to-right" : "animate-in slide-in-from-right",
          )}
        >
          <PanelResizeHandle onResize={(x) => setWidth(window.innerWidth - x)} />
          {sel.kind === "invoice" ? (
            <InvoiceDetailPanel
              key={`${sel.id}:${sel.tab ?? "overview"}`}
              id={sel.id}
              today={today}
              onClose={close}
              initialTab={sel.tab}
            />
          ) : (
            <CustomerDetailPanel
              key={`${sel.id}:${sel.tab ?? "overview"}`}
              id={sel.id}
              today={today}
              onClose={close}
              initialTab={sel.tab}
              onOpenInvoice={(invId) => open({ kind: "invoice", id: invId })}
            />
          )}
        </aside>
      )}
    </div>
  );
}
