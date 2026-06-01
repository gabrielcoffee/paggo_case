"use client";

import { useRouter } from "next/navigation";
import { InvoiceDetailPanel, type PanelTab } from "@/components/invoice-detail-panel";
import type { InvoiceRow } from "@/lib/queries/invoice-types";

// Full detail (all tabs) for direct navigation to /invoices/[id]. Reuses the same
// panel as the side sheet; closing returns to the list.
export function InvoiceDetailStandalone({
  row,
  today,
  initialTab,
}: {
  row: InvoiceRow;
  today: string;
  initialTab?: PanelTab;
}) {
  const router = useRouter();
  return (
    <div className="h-screen">
      <InvoiceDetailPanel
        id={row.id}
        initialRow={row}
        today={today}
        initialTab={initialTab}
        onClose={() => router.push("/invoices")}
      />
    </div>
  );
}
