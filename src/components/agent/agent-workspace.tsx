"use client";

import { useState } from "react";
import { AgentChat } from "@/components/agent/agent-chat";
import { InvoiceDetailPanel } from "@/components/invoice-detail-panel";
import { CustomerDetailPanel } from "@/components/customer-detail-panel";
import { prefetchDetail } from "@/lib/detail-cache";
import { prefetchCustomer } from "@/lib/customer-detail-cache";

type Selection = { kind: "invoice" | "customer"; id: string } | null;

// Splits the agent screen: chat on the left (shrinks), a detail panel on the right
// when the analyst clicks an invoice/customer row in a chat answer.
export function AgentWorkspace({ today }: { today: string }) {
  const [sel, setSel] = useState<Selection>(null);

  return (
    <div className="flex h-screen">
      <AgentChat
        onSelect={(kind, id) => {
          if (kind === "invoice") prefetchDetail(id);
          else prefetchCustomer(id);
          setSel({ kind, id });
        }}
      />
      {sel && (
        <aside className="flex h-screen w-full max-w-[480px] shrink-0 flex-col border-l border-border bg-card">
          {sel.kind === "invoice" ? (
            <InvoiceDetailPanel
              key={sel.id}
              id={sel.id}
              today={today}
              onClose={() => setSel(null)}
            />
          ) : (
            <CustomerDetailPanel
              key={sel.id}
              id={sel.id}
              today={today}
              onClose={() => setSel(null)}
              onOpenInvoice={(invId) => {
                prefetchDetail(invId);
                setSel({ kind: "invoice", id: invId });
              }}
            />
          )}
        </aside>
      )}
    </div>
  );
}
