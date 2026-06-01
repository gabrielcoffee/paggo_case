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
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Every status is always shown and selectable so a mis-click can be corrected
  // at any time (the current one is highlighted and disabled).
  const all = Object.keys(STATUS_LABELS) as InvoiceStatus[];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {all.map((t) => {
          const isCurrent = t === current;
          return (
            <Button
              key={t}
              size="sm"
              variant={isCurrent ? "default" : "outline"}
              disabled={pending || isCurrent}
              loading={busy === t}
              onClick={() => {
                setBusy(t);
                start(async () => {
                  const r = await updateInvoiceStatus({ invoiceId, to: t });
                  if (!r.ok) setErr(r.error);
                  else {
                    setErr(null);
                    onDone();
                  }
                  setBusy(null);
                });
              }}
            >
              {STATUS_LABELS[t]}
            </Button>
          );
        })}
      </div>
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
