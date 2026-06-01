"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X, Users, Eye, ReceiptText, MessageSquare, Clock, History } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RiskBadge } from "@/components/risk-badge";
import { StatusChip } from "@/components/status-chip";
import { AuditTimeline } from "@/components/audit-timeline";
import { NoteList } from "@/components/note-list";
import { NoteForm } from "@/components/forms/note-form";
import { FollowUpForm } from "@/components/forms/followup-form";
import {
  getCustomer,
  invalidateCustomer,
} from "@/lib/customer-detail-cache";
import { type CustomerDetail } from "@/lib/actions/customer-detail";
import type { CustomerRow } from "@/lib/queries/customer-types";
import type {
  DetailNote,
  DetailFollowUp,
  DetailAudit,
} from "@/lib/actions/invoice-detail";
import { addNote, scheduleFollowUp } from "@/lib/actions/invoices";
import { useMutation } from "@/lib/use-mutation";
import { prefetchDetail } from "@/lib/detail-cache";
import { brl, date, dateTime } from "@/lib/format";
import { daysOverdue } from "@/lib/aging";
import { SEGMENT_LABELS } from "@/lib/invoice-status";

const CHANNEL_LABELS: Record<string, string> = {
  phone: "Telefone",
  email: "E-mail",
  whatsapp: "WhatsApp",
};

// Instant stub from the list row: the Visão tab (aggregates) renders immediately
// while invoices/notes/follow-ups/audit load in the background.
function stubFromRow(r: CustomerRow): CustomerDetail {
  return {
    id: r.id,
    name: r.name,
    segment: r.segment,
    creditLimit: r.creditLimit,
    createdAt: "",
    openAr: r.openAr,
    overdueAr: r.overdueAr,
    invoiceCount: r.invoiceCount,
    overdueCount: r.overdueCount,
    maxRisk: r.maxRisk,
    invoices: [],
    notes: [],
    auditEvents: [],
    followUps: [],
  };
}

// Customer detail body (no slide-over wrapper). Reused by CustomerSheet and the
// agent workspace split panel. Clicking one of the customer's invoices calls
// onOpenInvoice so the parent can open the invoice detail.
// Synthetic audit event for instant (optimistic) Audit-tab updates.
function tmpAudit(action: string, payload: unknown): DetailAudit {
  return {
    id: `tmp-${crypto.randomUUID()}`,
    action,
    origin: "analyst",
    actor: "analyst",
    payload,
    timestamp: new Date().toISOString(),
  };
}

export function CustomerDetailPanel({
  id,
  initialRow,
  today,
  onClose,
  onOpenInvoice,
  initialTab,
}: {
  id: string;
  initialRow?: CustomerRow;
  today: string;
  onClose: () => void;
  onOpenInvoice: (invoiceId: string) => void;
  initialTab?: string;
}) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [, startLoad] = useTransition();
  const { run } = useMutation();
  const router = useRouter();

  const load = useCallback((custId: string) => {
    startLoad(async () => {
      const d = await getCustomer(custId);
      setDetail(d);
    });
  }, []);

  useEffect(() => {
    load(id);
  }, [id, load]);

  // Silent reconcile after a write lands OK (no blank: detail stays set).
  const reconcile = useCallback(() => {
    invalidateCustomer(id);
    getCustomer(id).then((d) => {
      if (d) setDetail(d);
    });
    // Refresh the current route's server components so aggregated lists behind the
    // Sheet (notes/follow-ups/agreements pages) update without a manual refresh.
    router.refresh();
  }, [id, router]);

  const applyPatch = (updater: (d: CustomerDetail) => CustomerDetail) => {
    const snapshot = detail;
    setDetail((d) => (d ? updater(d) : d));
    return () => setDetail(snapshot);
  };

  // Optimistic note/follow-up handlers for this customer (entityType "customer").
  const onAddNote = (body: string) => {
    const temp: DetailNote = {
      id: `tmp-${crypto.randomUUID()}`,
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
      () => addNote({ entityType: "customer", entityId: id, body }),
      { onSuccess: reconcile, successMessage: "Nota adicionada" },
    );
  };

  const onAddFollowUp = (input: { dueAt: string; channel: "phone" | "email" | "whatsapp"; body: string }) => {
    const temp: DetailFollowUp = {
      id: `tmp-${crypto.randomUUID()}`,
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
          entityType: "customer",
          entityId: id,
          dueAt: input.dueAt,
          channel: input.channel,
          body: input.body,
        }),
      { onSuccess: reconcile, successMessage: "Follow-up agendado" },
    );
  };

  const fresh = detail && detail.id === id ? detail : null;
  const view = fresh ?? (initialRow ? stubFromRow(initialRow) : null);
  const extrasLoading = !fresh;
  const todayDate = new Date(today);

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-start justify-between border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            {view ? (
              <>
                <h2 className="truncate text-base font-semibold">{view.name}</h2>
                <p className="font-mono text-xs text-muted-foreground">
                  {view.id} · {SEGMENT_LABELS[view.segment]}
                </p>
              </>
            ) : (
              <h2 className="text-base font-semibold text-muted-foreground">Carregando…</h2>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {view ? (
        <Tabs defaultValue={initialTab ?? "overview"} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-5 mt-3 self-start">
            <TabsTrigger value="overview" className="inline-flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" /> Visão
            </TabsTrigger>
            <TabsTrigger value="invoices" className="inline-flex items-center gap-1">
              <ReceiptText className="h-3.5 w-3.5" /> Faturas
              {view.invoiceCount ? ` (${view.invoiceCount})` : ""}
            </TabsTrigger>
            <TabsTrigger value="notes" className="inline-flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" /> Notas
              {view.notes.length ? ` (${view.notes.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="followups" className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> Follow-ups
            </TabsTrigger>
            <TabsTrigger value="audit" className="inline-flex items-center gap-1">
              <History className="h-3.5 w-3.5" /> Audit
            </TabsTrigger>
          </TabsList>

          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
            <TabsContent value="overview">
              <div className="grid grid-cols-2 gap-4">
                <Field label="AR em aberto" value={brl(view.openAr)} mono />
                <Field
                  label="AR vencido"
                  value={brl(view.overdueAr)}
                  mono
                  danger={view.overdueAr > 0}
                />
                <Field label="Faturas" value={String(view.invoiceCount)} mono />
                <Field
                  label="Vencidas"
                  value={String(view.overdueCount)}
                  mono
                  danger={view.overdueCount > 0}
                />
                <Field label="Limite de crédito" value={brl(view.creditLimit)} mono />
                <div className="flex flex-col gap-1">
                  <Label>Maior risco</Label>
                  {view.maxRisk > 0 ? (
                    <RiskBadge score={view.maxRisk} showLabel />
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
                <Field label="Segmento" value={SEGMENT_LABELS[view.segment] ?? view.segment} />
                <Field
                  label="Cliente desde"
                  value={view.createdAt ? date(view.createdAt) : "—"}
                  mono
                />
              </div>
            </TabsContent>

            <TabsContent value="invoices">
              {extrasLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : (
              <ul className="space-y-2">
                {view.invoices.map((inv) => {
                  const od = daysOverdue(new Date(inv.dueDate), todayDate);
                  return (
                    <li
                      key={inv.id}
                      onClick={() => onOpenInvoice(inv.id)}
                      onMouseEnter={() => prefetchDetail(inv.id)}
                      className="flex cursor-pointer items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-accent/40"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-muted-foreground">{inv.id}</div>
                        <div className="flex items-center gap-2">
                          <StatusChip status={inv.status as never} />
                          {od > 0 && (
                            <span className="text-[11px] text-destructive">{od}d atraso</span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="font-mono tabular-nums">{brl(inv.open)}</span>
                        <RiskBadge score={inv.riskScore} />
                      </div>
                    </li>
                  );
                })}
                {view.invoices.length === 0 && (
                  <li className="text-sm text-muted-foreground">Sem faturas.</li>
                )}
              </ul>
              )}
            </TabsContent>

            <TabsContent value="notes">
              <div className="space-y-4">
                <NoteForm onAdd={onAddNote} />
                {extrasLoading ? (
                  <p className="text-sm text-muted-foreground">Carregando…</p>
                ) : (
                  <NoteList notes={view.notes} />
                )}
              </div>
            </TabsContent>

            <TabsContent value="followups">
              <div className="space-y-3">
                {extrasLoading ? (
                  <p className="text-sm text-muted-foreground">Carregando…</p>
                ) : (
                <ul className="space-y-2">
                  {view.followUps.map((f) => (
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
                  {view.followUps.length === 0 && (
                    <li className="text-sm text-muted-foreground">Nenhum follow-up.</li>
                  )}
                </ul>
                )}
                <FollowUpForm onAdd={onAddFollowUp} />
              </div>
            </TabsContent>

            <TabsContent value="audit">
              {extrasLoading ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : (
                <AuditTimeline events={view.auditEvents} />
              )}
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
