"use client";

import { Sheet } from "@/components/ui/sheet";
import { InvoiceDetailPanel } from "@/components/invoice-detail-panel";
import type { InvoiceRow } from "@/lib/queries/invoice-types";

export function InvoiceSheet({
  row,
  today,
  onClose,
  onInvoiceChange,
}: {
  row: InvoiceRow | null;
  today: string;
  onClose: () => void;
  onInvoiceChange?: (id: string, patch: Partial<InvoiceRow>) => () => void;
}) {
  return (
    <Sheet open={row != null} onClose={onClose}>
      {row && (
        <InvoiceDetailPanel
          key={row.id}
          id={row.id}
          initialRow={row}
          today={today}
          onClose={onClose}
          onInvoiceChange={onInvoiceChange}
        />
      )}
    </Sheet>
  );
}
