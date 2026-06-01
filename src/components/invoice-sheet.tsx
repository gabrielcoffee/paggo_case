"use client";

import { Sheet } from "@/components/ui/sheet";
import { InvoiceDetailPanel } from "@/components/invoice-detail-panel";
import type { InvoiceRow } from "@/lib/queries/invoice-types";

export function InvoiceSheet({
  row,
  today,
  onClose,
}: {
  row: InvoiceRow | null;
  today: string;
  onClose: () => void;
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
        />
      )}
    </Sheet>
  );
}
