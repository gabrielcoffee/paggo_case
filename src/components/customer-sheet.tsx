"use client";

import { Sheet } from "@/components/ui/sheet";
import { CustomerDetailPanel } from "@/components/customer-detail-panel";

export function CustomerSheet({
  customerId,
  today,
  onClose,
  onOpenInvoice,
}: {
  customerId: string | null;
  today: string;
  onClose: () => void;
  onOpenInvoice: (invoiceId: string) => void;
}) {
  return (
    <Sheet open={customerId != null} onClose={onClose}>
      {customerId && (
        <CustomerDetailPanel
          key={customerId}
          id={customerId}
          today={today}
          onClose={onClose}
          onOpenInvoice={onOpenInvoice}
        />
      )}
    </Sheet>
  );
}
