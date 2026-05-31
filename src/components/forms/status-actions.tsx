"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateInvoiceStatus } from "@/lib/actions/invoices";
import { STATUS_LABELS } from "@/lib/invoice-status";
import type { InvoiceStatus } from "@/generated/prisma/enums";

export function StatusActions({
  invoiceId,
  current,
  onDone,
}: {
  invoiceId: string;
  current: string;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  // Any status is reachable so a mis-click can always be corrected.
  const targets = (Object.keys(STATUS_LABELS) as InvoiceStatus[]).filter(
    (s) => s !== current,
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {targets.map((t) => (
          <Button
            key={t}
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await updateInvoiceStatus({ invoiceId, to: t });
                if (!r.ok) setErr(r.error);
                else {
                  setErr(null);
                  onDone();
                }
              })
            }
          >
            {STATUS_LABELS[t]}
          </Button>
        ))}
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
