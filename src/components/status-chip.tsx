import type { InvoiceStatus, PaymentStatus } from "@/generated/prisma/enums";
import { STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/lib/invoice-status";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  open: "bg-secondary text-secondary-foreground ring-border",
  in_negotiation: "bg-chart-2/15 text-chart-2 ring-chart-2/30",
  agreement_signed: "bg-primary/12 text-primary ring-primary/30",
  paid: "bg-chart-4/15 text-chart-4 ring-chart-4/30",
  written_off: "bg-muted text-muted-foreground ring-border line-through",
  disputed: "bg-destructive/12 text-destructive ring-destructive/30",
};

export function StatusChip({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        STATUS_STYLES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

const PAYMENT_STYLES: Record<PaymentStatus, string> = {
  unpaid: "text-muted-foreground",
  partial: "text-chart-2",
  paid: "text-chart-4",
};

export function PaymentStatusDot({ status }: { status: PaymentStatus }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", PAYMENT_STYLES[status])}>
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {PAYMENT_STATUS_LABELS[status]}
    </span>
  );
}
