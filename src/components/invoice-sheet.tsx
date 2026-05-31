"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RiskBadge } from "@/components/risk-badge";
import { StatusChip, PaymentStatusDot } from "@/components/status-chip";
import { AuditTimeline } from "@/components/audit-timeline";
import { StatusActions } from "@/components/forms/status-actions";
import { NoteForm } from "@/components/forms/note-form";
import { FollowUpForm } from "@/components/forms/followup-form";
import { AgreementModal } from "@/components/forms/agreement-modal";
import {
  fetchInvoiceDetail,
  type InvoiceDetail,
} from "@/lib/actions/invoice-detail";
import type { InvoiceRow } from "@/lib/queries/invoice-types";
import { brl, date, dateTime } from "@/lib/format";
import { daysOverdue } from "@/lib/aging";
import {
  SEGMENT_LABELS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/invoice-status";
import { RULE_LABELS } from "@/lib/risk-rules";

const CHANNEL_LABELS: Record<string, string> = {
  phone: "Telefone",
  email: "E-mail",
  whatsapp: "WhatsApp",
};

// The core fields + risk factors already live in memory (the clicked row), so the
// Visão tab renders instantly. Only the mutable lists below are unknown until the
// background fetch returns.
function stubFromRow(row: InvoiceRow): InvoiceDetail {
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customerName,
    segment: row.segment,
    paymentMethod: row.paymentMethod,
    amount: row.amount,
    amountPaid: row.amountPaid,
    open: row.open,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    paidDate: row.paidDate,
    attempts: row.attempts,
    status: row.status,
    paymentStatus: row.paymentStatus,
    riskScore: row.riskScore,
    riskFactors: row.riskFactors,
    notes: [],
    auditEvents: [],
    followUps: [],
    agreements: [],
  };
}

export function InvoiceSheet({
  row,
  today,
  onClose,
}: {
  row: InvoiceRow | null;
  today: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [, startLoad] = useTransition();
  const id = row?.id ?? null;

  const load = useCallback((invId: string) => {
    startLoad(async () => {
      const d = await fetchInvoiceDetail(invId);
      setDetail(d);
    });
  }, []);

  useEffect(() => {
    if (id) load(id);
  }, [id, load]);

  const refresh = useCallback(() => {
    if (id) load(id);
  }, [id, load]);

  // Authoritative data once it matches the open id; otherwise the instant stub.
  const fresh = detail && detail.id === id ? detail : null;
  const view = fresh ?? (row ? stubFromRow(row) : null);
  const extrasLoading = !fresh && id != null;

  return (
    <Sheet open={id != null} onClose={onClose}>
      {view && (
        <div className="flex h-full flex-col">
          <header className="flex shrink-0 items-start justify-between border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">{view.customerName}</h2>
              <p className="font-mono text-xs text-muted-foreground">
                {view.id} · {SEGMENT_LABELS[view.segment]}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <RiskBadge score={view.riskScore} showLabel />
              <button
                onClick={onClose}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <Tabs key={id} defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="mx-5 mt-3 self-start">
              <TabsTrigger value="overview">Visão</TabsTrigger>
              <TabsTrigger value="notes">
                Notas{view.notes.length ? ` (${view.notes.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="audit">
                Audit{view.auditEvents.length ? ` (${view.auditEvents.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="agreement">Acordo</TabsTrigger>
            </TabsList>

            <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
              <TabsContent value="overview">
                <Overview detail={view} today={today} extrasLoading={extrasLoading} onDone={refresh} />
              </TabsContent>
              <TabsContent value="notes">
                <div className="space-y-4">
                  <NoteForm invoiceId={view.id} onDone={refresh} />
                  {extrasLoading ? (
                    <p className="text-sm text-muted-foreground">Carregando…</p>
                  ) : (
                    <ul className="space-y-3">
                      {view.notes.map((n) => (
                        <li key={n.id} className="rounded-lg border border-border p-3">
                          <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {n.author} · {dateTime(n.createdAt)}
                          </p>
                        </li>
                      ))}
                      {view.notes.length === 0 && (
                        <li className="text-sm text-muted-foreground">Sem notas ainda.</li>
                      )}
                    </ul>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="audit">
                {extrasLoading ? (
                  <p className="text-sm text-muted-foreground">Carregando…</p>
                ) : (
                  <AuditTimeline events={view.auditEvents} />
                )}
              </TabsContent>
              <TabsContent value="agreement">
                <Agreements detail={view} extrasLoading={extrasLoading} onDone={refresh} />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      )}
    </Sheet>
  );
}

function Overview({
  detail,
  today,
  extrasLoading,
  onDone,
}: {
  detail: InvoiceDetail;
  today: string;
  extrasLoading: boolean;
  onDone: () => void;
}) {
  const od = daysOverdue(new Date(detail.dueDate), new Date(today));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Valor" value={brl(detail.amount)} mono />
        <Field label="Em aberto" value={brl(detail.open)} mono />
        <Field label="Vencimento" value={date(detail.dueDate)} mono />
        <Field
          label="Atraso"
          value={od > 0 ? `${od} dias` : "Em dia"}
          danger={od > 0}
        />
        <div className="flex flex-col gap-1">
          <Label>Status</Label>
          <StatusChip status={detail.status as never} />
        </div>
        <div className="flex flex-col gap-1">
          <Label>Pagamento</Label>
          <PaymentStatusDot status={detail.paymentStatus as never} />
        </div>
        <Field label="Método" value={PAYMENT_METHOD_LABELS[detail.paymentMethod]} />
        <Field label="Tentativas" value={String(detail.attempts)} mono />
      </div>

      <section>
        <Label>Composição do risco · {detail.riskScore}/100</Label>
        {detail.riskFactors.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nenhuma regra disparou.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {detail.riskFactors.map((f) => (
              <li key={f.rule} className="flex items-start gap-3 text-sm">
                <span className="w-8 shrink-0 text-right font-mono font-semibold text-primary">
                  +{f.points}
                </span>
                <div>
                  <div className="font-medium">{RULE_LABELS[f.rule] ?? f.rule}</div>
                  <div className="text-xs text-muted-foreground">{f.description}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <Label>Ações de status</Label>
        <div className="mt-2">
          <StatusActions invoiceId={detail.id} current={detail.status} onDone={onDone} />
        </div>
      </section>

      <section>
        <Label>Follow-ups</Label>
        <ul className="mb-3 mt-2 space-y-2">
          {extrasLoading ? (
            <li className="text-sm text-muted-foreground">Carregando…</li>
          ) : (
            <>
              {detail.followUps.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-sm"
                >
                  <span>
                    {CHANNEL_LABELS[f.channel] ?? f.channel} · {dateTime(f.dueAt)}
                  </span>
                  <span className="text-xs text-muted-foreground">{f.status}</span>
                </li>
              ))}
              {detail.followUps.length === 0 && (
                <li className="text-sm text-muted-foreground">Nenhum follow-up.</li>
              )}
            </>
          )}
        </ul>
        <FollowUpForm invoiceId={detail.id} onDone={onDone} />
      </section>
    </div>
  );
}

function Agreements({
  detail,
  extrasLoading,
  onDone,
}: {
  detail: InvoiceDetail;
  extrasLoading: boolean;
  onDone: () => void;
}) {
  return (
    <div className="space-y-4">
      <AgreementModal
        invoiceId={detail.id}
        openCents={Math.round(detail.open * 100)}
        onDone={onDone}
      />
      {extrasLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : detail.agreements.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum acordo firmado.</p>
      ) : (
        detail.agreements.map((ag) => (
          <div key={ag.id} className="rounded-lg border border-border">
            <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs text-muted-foreground">
              <span>
                {ag.installments}x
                {ag.discountPct ? ` · ${ag.discountPct}% desc` : ""}
                {ag.feePct ? ` · ${ag.feePct}% juros` : ""}
              </span>
              <span>{dateTime(ag.createdAt)}</span>
            </div>
            <ul className="text-sm">
              {ag.installmentRows.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between px-3 py-1.5"
                >
                  <span className="text-muted-foreground">
                    {r.installmentNumber}. {date(r.dueDate)}
                  </span>
                  <span className="font-mono tabular-nums">{brl(r.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
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
      <Label>{label}</Label>
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
