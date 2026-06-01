"use client";

import { Sheet } from "@/components/ui/sheet";
import { CustomerDetailPanel } from "@/components/customer-detail-panel";
import type { CustomerRow } from "@/lib/queries/customer-types";

export function CustomerSheet({
  customer,
  today,
  onClose,
  onOpenInvoice,
}: {
  customer: CustomerRow | null;
  today: string;
  onClose: () => void;
  onOpenInvoice: (invoiceId: string) => void;
}) {
  return (
    <Sheet open={customer != null} onClose={onClose}>
      {customer && (
        <CustomerDetailPanel
          key={customer.id}
          id={customer.id}
          initialRow={customer}
          today={today}
          onClose={onClose}
          onOpenInvoice={onOpenInvoice}
        />
      )}
    </Sheet>
  );
}
