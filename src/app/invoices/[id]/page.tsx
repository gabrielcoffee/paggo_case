import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { RiskBadge } from "@/components/risk-badge";
import { StatusChip, PaymentStatusDot } from "@/components/status-chip";
import { appToday } from "@/lib/risk";
import { brl, date } from "@/lib/format";
import { daysOverdue } from "@/lib/aging";
import {
  SEGMENT_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/invoice-status";
import type { RiskFactor } from "@/lib/risk";
import { RULE_LABELS } from "@/lib/risk-rules";

// Minimal detail view for Day 3. The full drawer with notes, audit log, and
// CRUD actions lands on Day 4.
export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: { customer: true },
  });
  if (!inv) notFound();

  const today = appToday();
  const open = Number(inv.amount) - Number(inv.amountPaid);
  const od = daysOverdue(inv.dueDate, today);
  const factors = (inv.riskFactors as unknown as RiskFactor[]) ?? [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      <Link
        href="/invoices"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para faturas
      </Link>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold">{inv.customer.name}</h1>
            <p className="font-mono text-xs text-muted-foreground">
              {inv.id} · {inv.customerId} · {SEGMENT_LABELS[inv.customer.segment]}
            </p>
          </div>
          <RiskBadge score={inv.riskScore} showLabel />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Valor" value={brl(inv.amount)} />
          <Field label="Em aberto" value={brl(open)} mono />
          <Field label="Vencimento" value={date(inv.dueDate)} mono />
          <Field
            label="Atraso"
            value={od > 0 ? `${od} dias` : "Em dia"}
            danger={od > 0}
          />
          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Status
            </span>
            <StatusChip status={inv.status} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Pagamento
            </span>
            <PaymentStatusDot status={inv.paymentStatus} />
          </div>
          <Field
            label="Método"
            value={PAYMENT_METHOD_LABELS[inv.paymentMethod]}
          />
          <Field label="Tentativas" value={String(inv.attempts)} mono />
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">
          Composição do risco
          <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
            {inv.riskScore}/100
          </span>
        </h2>
        {factors.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nenhuma regra de risco disparou para esta fatura.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {factors.map((f) => (
              <li key={f.rule} className="flex items-start gap-3">
                <span className="mt-0.5 w-8 shrink-0 text-right font-mono text-sm font-semibold tabular-nums text-primary">
                  +{f.points}
                </span>
                <div>
                  <div className="text-sm font-medium">{ruleLabel(f.rule)}</div>
                  <div className="text-xs text-muted-foreground">{f.description}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  danger,
}: {
  label: string;
  value: string;
  mono?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={
          "text-sm font-medium " +
          (mono ? "font-mono tabular-nums " : "") +
          (danger ? "text-destructive" : "")
        }
      >
        {value}
      </span>
    </div>
  );
}

function ruleLabel(rule: string): string {
  return RULE_LABELS[rule] ?? rule;
}
