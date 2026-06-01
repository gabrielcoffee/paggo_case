"use client";

import { Button } from "@/components/ui/button";
import { STATUS_LABELS } from "@/lib/invoice-status";
import type { InvoiceStatus } from "@/generated/prisma/enums";

// Dumb buttons: emit the target status to the parent, which flips it optimistically
// and writes in the background. The current status (which updates instantly) is
// highlighted and disabled; every other status stays selectable so a mis-click is
// always correctable.
export function StatusActions({
  current,
  onSetStatus,
}: {
  current: string;
  onSetStatus: (to: InvoiceStatus) => void;
}) {
  const all = Object.keys(STATUS_LABELS) as InvoiceStatus[];

  return (
    <div className="flex flex-wrap gap-2">
      {all.map((t) => {
        const isCurrent = t === current;
        return (
          <Button
            key={t}
            size="sm"
            variant={isCurrent ? "default" : "outline"}
            disabled={isCurrent}
            onClick={() => onSetStatus(t)}
          >
            {STATUS_LABELS[t]}
          </Button>
        );
      })}
    </div>
  );
}
