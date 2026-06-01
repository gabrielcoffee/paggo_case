"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Pencil, Trash2, ReceiptText } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RiskBadge } from "@/components/risk-badge";
import { StatusChip, PaymentStatusDot } from "@/components/status-chip";
import { AuditTimeline } from "@/components/audit-timeline";
import { IconBtn } from "@/components/icon-button";
import { NoteList } from "@/components/note-list";
import { StatusActions } from "@/components/forms/status-actions";
import { NoteForm } from "@/components/forms/note-form";
import { FollowUpForm, type FollowUpInput } from "@/components/forms/followup-form";
import { AgreementModal, type AgreementInput } from "@/components/forms/agreement-modal";
import {
  type InvoiceDetail,
  type DetailAgreement,
  type DetailNote,
  type DetailFollowUp,
  type DetailAudit,
} from "@/lib/actions/invoice-detail";
import { getDetail, invalidateDetail } from "@/lib/detail-cache";
import type { InvoiceRow } from "@/lib/queries/invoice-types";
import {
  updateInvoiceStatus,
  addNote,
  updateNote,
  deleteNote,
  scheduleFollowUp,
  createPaymentAgreement,
  updateAgreement,
  deleteAgreement,
} from "@/lib/actions/invoices";
import { useMutation } from "@/lib/use-mutation";
import { brl, date, dateTime } from "@/lib/format";
import { daysOverdue } from "@/lib/aging";
import { SEGMENT_LABELS, PAYMENT_METHOD_LABELS, canTransition } from "@/lib/invoice-status";
import { buildSchedule } from "@/lib/agreement";
import { RULE_LABELS } from "@/lib/risk-rules";
import type { InvoiceStatus } from "@/generated/prisma/enums";

const CHANNEL_LABELS: Record<string, string> = {
  phone: "Telefone",
  email: "E-mail",
  whatsapp: "WhatsApp",
};

const tmpId = () => `tmp-${crypto.randomUUID()}`;

// Synthetic audit event so the Audit tab updates instantly (optimistically),
// before the background write + reconcile replace it with the real one.
function tmpAudit(action: string, payload: unknown): DetailAudit {
  return {
    id: tmpId(),
    action,
    origin: "analyst",
    actor: "analyst",
    payload,
    timestamp: new Date().toISOString(),
  };
}

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

export type InvoiceHandlers = {
  onSetStatus: (to: InvoiceStatus) => void;
  onAddNote: (body: string) => void;
  onUpdateNote: (id: string, body: string) => void;
  onDeleteNote: (id: string) => void;
  onAddFollowUp: (input: FollowUpInput) => void;
  onCreateAgreement: (input: AgreementInput) => void;
  onUpdateAgreement: (id: string, input: AgreementInput) => void;
  onDeleteAgreement: (id: string) => void;
};

// Presentational detail body (no slide-over wrapper). Reused by InvoiceSheet (on the
// invoices list) and by the agent workspace / customer panel. With `initialRow` it
// renders instantly from memory. Every mutation is optimistic: the local detail
// (and, via `onInvoiceChange`, the row behind on the list) updates synchronously
// while the write runs in the background — the UI never waits on the database.
export function InvoiceDetailPanel({
  id,
  initialRow,
  today,
  onClose,
  onInvoiceChange,
}: {
  id: string;
  initialRow?: InvoiceRow;
  today: string;
  onClose: () => void;
  onInvoiceChange?: (id: string, patch: Partial<InvoiceRow>) => () => void;
}) {
  const [detail, setDetail] = useState<InvoiceDetail | null>(
    initialRow ? stubFromRow(initialRow) : null,
  );
  const [loaded, setLoaded] = useState(false);
  const { run } = useMutation();

  // Mounted fresh per invoice id (InvoiceSheet keys on row.id), so a single
  // background fetch fills the mutable lists. `loaded` gates the list spinners.
  useEffect(() => {
    let alive = true;
    (async () => {
      const d = await getDetail(id);
      if (alive && d) {
        setDetail(d);
        setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  // Silent reconcile after a write lands OK: swaps temp ids for real rows and
  // fills the audit tab. `detail` stays set, so no "Carregando…" flash.
  const reconcile = useCallback(() => {
    invalidateDetail(id);
    getDetail(id).then((d) => {
      if (d) setDetail(d);
    });
  }, [id]);

  // Apply an optimistic patch to the local detail, returning a rollback. Defined
  // inline each render so it closes over the current `detail` for the snapshot.
  const applyPatch = (updater: (d: InvoiceDetail) => InvoiceDetail) => {
    const snapshot = detail;
    setDetail((d) => (d ? updater(d) : d));
    return () => setDetail(snapshot);
  };

  const h: InvoiceHandlers = {
    onSetStatus(to) {
      const paid = to === "paid";
      run(
        () => {
          const listPatch: Partial<InvoiceRow> = paid
            ? {
                status: to,
                paymentStatus: "paid",
                amountPaid: detail?.amount ?? 0,
                open: 0,
                riskScore: 0,
              }
            : { status: to };
          const rbList = onInvoiceChange?.(id, listPatch) ?? (() => {});
          const rbDetail = applyPatch((d) => ({
            ...d,
            status: to,
            ...(paid
              ? {
                  paymentStatus: "paid",
                  amountPaid: d.amount,
                  open: 0,
                  riskScore: 0,
                  riskFactors: [],
                }
              : {}),
            auditEvents: [tmpAudit("status_change", { from: d.status, to }), ...d.auditEvents],
          }));
          return () => {
            rbDetail();
            rbList();
          };
        },
        () => updateInvoiceStatus({ invoiceId: id, to }),
        { onSuccess: reconcile, successMessage: "Status atualizado" },
      );
    },

    onAddNote(body) {
      const temp: DetailNote = {
        id: tmpId(),
        author: "analyst",
        body,
        createdAt: new Date().toISOString(),
      };
      run(
        () =>
          applyPatch((d) => ({
            ...d,
            notes: [temp, ...d.notes],
            auditEvents: [tmpAudit("note_added", { noteId: temp.id }), ...d.auditEvents],
          })),
        () => addNote({ entityType: "invoice", entityId: id, body }),
        { onSuccess: reconcile, successMessage: "Nota adicionada" },
      );
    },

    onUpdateNote(noteId, body) {
      run(
        () =>
          applyPatch((d) => ({
            ...d,
            notes: d.notes.map((n) => (n.id === noteId ? { ...n, body } : n)),
            auditEvents: [tmpAudit("note_updated", { noteId }), ...d.auditEvents],
          })),
        () => updateNote({ noteId, body }),
        { onSuccess: reconcile, successMessage: "Nota atualizada" },
      );
    },

    onDeleteNote(noteId) {
      run(
        () =>
          applyPatch((d) => ({
            ...d,
            notes: d.notes.filter((n) => n.id !== noteId),
            auditEvents: [tmpAudit("note_deleted", { noteId }), ...d.auditEvents],
          })),
        () => deleteNote(noteId),
        { onSuccess: reconcile, successMessage: "Nota excluída" },
      );
    },

    onAddFollowUp(input) {
      const temp: DetailFollowUp = {
        id: tmpId(),
        dueAt: input.dueAt,
        channel: input.channel,
        status: "pending",
        body: input.body,
        assignee: null,
        createdBy: "analyst",
      };
      run(
        () =>
          applyPatch((d) => ({
            ...d,
            followUps: [...d.followUps, temp].sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
            auditEvents: [tmpAudit("followup_scheduled", { channel: input.channel }), ...d.auditEvents],
          })),
        () =>
          scheduleFollowUp({
            entityType: "invoice",
            entityId: id,
            dueAt: input.dueAt,
            channel: input.channel,
            body: input.body,
          }),
        { onSuccess: reconcile, successMessage: "Follow-up agendado" },
      );
    },

    onCreateAgreement(input) {
      const base = detail;
      const sched = buildSchedule({
        baseCents: Math.round((base?.open ?? 0) * 100),
        installments: input.installments,
        discountPct: input.discountPct,
        feePct: input.feePct,
        firstDueDate: input.firstDueDate,
        intervalDays: input.intervalDays,
      });
      const temp: DetailAgreement = {
        id: tmpId(),
        installments: input.installments,
        discountPct: input.discountPct ?? null,
        feePct: input.feePct ?? null,
        createdBy: "analyst",
        createdAt: new Date().toISOString(),
        installmentRows: sched.rows.map((r) => ({
          id: `tmp-${r.installmentNumber}`,
          installmentNumber: r.installmentNumber,
          dueDate: new Date(r.dueDate).toISOString(),
          amount: r.amountCents / 100,
          status: "open",
        })),
      };
      const moveToAgreement =
        !!base &&
        base.status !== "agreement_signed" &&
        canTransition(base.status as InvoiceStatus, "agreement_signed");
      run(
        () => {
          const rbList = moveToAgreement
            ? onInvoiceChange?.(id, { status: "agreement_signed" }) ?? (() => {})
            : () => {};
          const rbDetail = applyPatch((d) => ({
            ...d,
            agreements: [temp, ...d.agreements],
            ...(moveToAgreement ? { status: "agreement_signed" } : {}),
            auditEvents: [tmpAudit("agreement_created", { installments: input.installments }), ...d.auditEvents],
          }));
          return () => {
            rbDetail();
            rbList();
          };
        },
        () => createPaymentAgreement({ invoiceId: id, ...input }),
        { onSuccess: reconcile, successMessage: "Acordo criado" },
      );
    },

    onUpdateAgreement(agreementId, input) {
      const base = detail;
      const sched = buildSchedule({
        baseCents: Math.round((base?.open ?? 0) * 100),
        installments: input.installments,
        discountPct: input.discountPct,
        feePct: input.feePct,
        firstDueDate: input.firstDueDate,
        intervalDays: input.intervalDays,
      });
      run(
        () =>
          applyPatch((d) => ({
            ...d,
            agreements: d.agreements.map((ag) =>
              ag.id === agreementId
                ? {
                    ...ag,
                    installments: input.installments,
                    discountPct: input.discountPct ?? null,
                    feePct: input.feePct ?? null,
                    installmentRows: sched.rows.map((r) => ({
                      id: `tmp-${r.installmentNumber}`,
                      installmentNumber: r.installmentNumber,
                      dueDate: new Date(r.dueDate).toISOString(),
                      amount: r.amountCents / 100,
                      status: "open",
                    })),
                  }
                : ag,
            ),
            auditEvents: [tmpAudit("agreement_updated", { agreementId }), ...d.auditEvents],
          })),
        () => updateAgreement({ agreementId, ...input }),
        { onSuccess: reconcile, successMessage: "Acordo atualizado" },
      );
    },

    onDeleteAgreement(agreementId) {
      run(
        () =>
          applyPatch((d) => ({
            ...d,
            agreements: d.agreements.filter((ag) => ag.id !== agreementId),
            auditEvents: [tmpAudit("agreement_deleted", { agreementId }), ...d.auditEvents],
          })),
        () => deleteAgreement(agreementId),
        { onSuccess: reconcile, successMessage: "Acordo excluído" },
      );
    },
  };

  const view = detail;
  const extrasLoading = !loaded;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-start justify-between border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ReceiptText className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            {view ? (
              <>
                <h2 className="truncate text-base font-semibold">{view.customerName}</h2>
                <p className="font-mono text-xs text-muted-foreground">
                  {view.id} · {SEGMENT_LABELS[view.segment]}
                </p>
              </>
            ) : (
              <h2 className="text-base font-semibold text-muted-foreground">Carregando…</h2>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {view && <RiskBadge score={view.riskScore} showLabel />}
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {view ? (
        <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
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
              <Overview detail={view} today={today} extrasLoading={extrasLoading} h={h} />
            </TabsContent>
            <TabsContent value="notes">
              <div className="space-y-4">
                <NoteForm onAdd={h.onAddNote} />
                {extrasLoading ? (
                  <p className="text-sm text-muted-foreground">Carregando…</p>
                ) : (
                  <NoteList notes={view.notes} onUpdate={h.onUpdateNote} onDelete={h.onDeleteNote} />
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
              <Agreements detail={view} extrasLoading={extrasLoading} h={h} />
            </TabsContent>
          </div>
        </Tabs>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Carregando…
        </div>
      )}
    </div>
  );
}

function Overview({
  detail,
  today,
  extrasLoading,
  h,
}: {
  detail: InvoiceDetail;
  today: string;
  extrasLoading: boolean;
  h: InvoiceHandlers;
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
          <StatusActions current={detail.status} onSetStatus={h.onSetStatus} />
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
        <FollowUpForm onAdd={h.onAddFollowUp} />
      </section>
    </div>
  );
}

function Agreements({
  detail,
  extrasLoading,
  h,
}: {
  detail: InvoiceDetail;
  extrasLoading: boolean;
  h: InvoiceHandlers;
}) {
  return (
    <div className="space-y-4">
      <AgreementModal openCents={Math.round(detail.open * 100)} onSubmit={h.onCreateAgreement} />
      {extrasLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : detail.agreements.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum acordo firmado.</p>
      ) : (
        detail.agreements.map((ag) => (
          <AgreementCard key={ag.id} ag={ag} openCents={Math.round(detail.open * 100)} h={h} />
        ))
      )}
    </div>
  );
}

function AgreementCard({
  ag,
  openCents,
  h,
}: {
  ag: DetailAgreement;
  openCents: number;
  h: InvoiceHandlers;
}) {
  const firstDueDate =
    ag.installmentRows[0]?.dueDate.slice(0, 10) ??
    new Date().toISOString().slice(0, 10);
  const intervalDays =
    ag.installmentRows.length > 1
      ? Math.max(
          1,
          Math.round(
            (new Date(ag.installmentRows[1].dueDate).getTime() -
              new Date(ag.installmentRows[0].dueDate).getTime()) /
              86_400_000,
          ),
        )
      : 30;

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs text-muted-foreground">
        <span>
          {ag.installments}x
          {ag.discountPct ? ` · ${ag.discountPct}% desc` : ""}
          {ag.feePct ? ` · ${ag.feePct}% juros` : ""}
        </span>
        <div className="flex items-center gap-1">
          <span>{dateTime(ag.createdAt)}</span>
          <AgreementModal
            openCents={openCents}
            onSubmit={(input) => h.onUpdateAgreement(ag.id, input)}
            agreement={{
              id: ag.id,
              installments: ag.installments,
              discountPct: ag.discountPct,
              feePct: ag.feePct,
              firstDueDate,
              intervalDays,
            }}
            trigger={
              <IconBtn label="Editar acordo">
                <Pencil className="h-3.5 w-3.5" />
              </IconBtn>
            }
          />
          <IconBtn label="Excluir acordo" onClick={() => h.onDeleteAgreement(ag.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      </div>
      <ul className="text-sm">
        {ag.installmentRows.map((r) => (
          <li key={r.id} className="flex items-center justify-between px-3 py-1.5">
            <span className="text-muted-foreground">
              {r.installmentNumber}. {date(r.dueDate)}
            </span>
            <span className="font-mono tabular-nums">{brl(r.amount)}</span>
          </li>
        ))}
      </ul>
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
