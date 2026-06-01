"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { buildSchedule } from "@/lib/agreement";
import { brl, date } from "@/lib/format";
import { createPaymentAgreement, updateAgreement } from "@/lib/actions/invoices";

const numInput =
  "h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm tabular-nums outline-none ring-ring/40 focus:ring-2";

export type EditAgreement = {
  id: string;
  installments: number;
  discountPct: number | null;
  feePct: number | null;
  firstDueDate: string;
  intervalDays: number;
};

export function AgreementModal({
  invoiceId,
  openCents,
  onDone,
  agreement,
  trigger,
}: {
  invoiceId: string;
  openCents: number;
  onDone: () => void;
  agreement?: EditAgreement;
  trigger?: React.ReactNode;
}) {
  const isEdit = !!agreement;
  const [open, setOpen] = useState(false);
  const [installments, setInstallments] = useState(agreement?.installments ?? 3);
  const [discountPct, setDiscount] = useState(agreement?.discountPct ?? 0);
  const [feePct, setFee] = useState(agreement?.feePct ?? 0);
  const [firstDueDate, setFirst] = useState(
    agreement?.firstDueDate ?? new Date().toISOString().slice(0, 10),
  );
  const [intervalDays, setInterval] = useState(agreement?.intervalDays ?? 30);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const schedule = useMemo(
    () =>
      buildSchedule({
        baseCents: openCents,
        installments: Math.max(1, installments),
        discountPct,
        feePct,
        firstDueDate,
        intervalDays: Math.max(1, intervalDays),
      }),
    [openCents, installments, discountPct, feePct, firstDueDate, intervalDays],
  );

  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)}>{trigger}</span>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Criar acordo
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Editar acordo" : "Novo acordo de pagamento"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Parcelas">
              <input
                type="number"
                min={1}
                max={36}
                value={installments}
                onChange={(e) => setInstallments(Number(e.target.value))}
                className={numInput}
              />
            </Field>
            <Field label="Intervalo (dias)">
              <input
                type="number"
                min={1}
                max={180}
                value={intervalDays}
                onChange={(e) => setInterval(Number(e.target.value))}
                className={numInput}
              />
            </Field>
            <Field label="Desconto %">
              <input
                type="number"
                min={0}
                max={100}
                value={discountPct}
                onChange={(e) => setDiscount(Number(e.target.value))}
                className={numInput}
              />
            </Field>
            <Field label="Juros/multa %">
              <input
                type="number"
                min={0}
                max={100}
                value={feePct}
                onChange={(e) => setFee(Number(e.target.value))}
                className={numInput}
              />
            </Field>
            <Field label="1º vencimento" className="col-span-2">
              <DatePicker value={firstDueDate} onChange={setFirst} />
            </Field>
          </div>

          <div className="rounded-lg border border-border">
            <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs text-muted-foreground">
              <span>Prévia ({schedule.rows.length}x)</span>
              <span className="font-mono font-semibold text-foreground">
                Total {brl(schedule.totalCents / 100)}
              </span>
            </div>
            <ul className="max-h-40 overflow-auto text-sm">
              {schedule.rows.map((r) => (
                <li
                  key={r.installmentNumber}
                  className="flex items-center justify-between px-3 py-1.5"
                >
                  <span className="text-muted-foreground">
                    {r.installmentNumber}. {date(r.dueDate)}
                  </span>
                  <span className="font-mono tabular-nums">
                    {brl(r.amountCents / 100)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {err && <p className="text-xs text-destructive">{err}</p>}

          <Button
            loading={pending}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = isEdit
                  ? await updateAgreement({
                      agreementId: agreement.id,
                      installments,
                      discountPct: discountPct || undefined,
                      feePct: feePct || undefined,
                      firstDueDate,
                      intervalDays,
                    })
                  : await createPaymentAgreement({
                      invoiceId,
                      installments,
                      discountPct: discountPct || undefined,
                      feePct: feePct || undefined,
                      firstDueDate,
                      intervalDays,
                    });
                if (!r.ok) setErr(r.error);
                else {
                  setOpen(false);
                  onDone();
                }
              })
            }
          >
            {isEdit ? "Salvar acordo" : "Confirmar acordo"}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={"flex flex-col gap-1 " + (className ?? "")}>
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
