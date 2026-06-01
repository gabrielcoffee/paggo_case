"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
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
import { prefetchDetail } from "@/lib/detail-cache";
import { brl, date, dateTime } from "@/lib/format";
import { daysOverdue } from "@/lib/aging";
import { SEGMENT_LABELS } from "@/lib/invoice-status";

const CHANNEL_LABELS: Record<string, string> = {
  phone: "Telefone",
  email: "E-mail",
  whatsapp: "WhatsApp",
};

// Customer detail body (no slide-over wrapper). Reused by CustomerSheet and the
// agent workspace split panel. Clicking one of the customer's invoices calls
// onOpenInvoice so the parent can open the invoice detail.
export function CustomerDetailPanel({
  id,
  today,
  onClose,
  onOpenInvoice,
}: {
  id: string;
  today: string;
  onClose: () => void;
  onOpenInvoice: (invoiceId: string) => void;
}) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [, startLoad] = useTransition();

  const load = useCallback((custId: string) => {
    startLoad(async () => {
      const d = await getCustomer(custId);
      setDetail(d);
    });
  }, []);

  useEffect(() => {
    load(id);
  }, [id, load]);

  const refresh = useCallback(() => {
    invalidateCustomer(id);
    load(id);
  }, [id, load]);

  const view = detail && detail.id === id ? detail : null;
  const todayDate = new Date(today);

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-start justify-between border-b border-border px-5 py-4">
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
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {view ? (
        <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-5 mt-3 self-start">
            <TabsTrigger value="overview">Visão</TabsTrigger>
            <TabsTrigger value="invoices">
              Faturas{view.invoiceCount ? ` (${view.invoiceCount})` : ""}
            </TabsTrigger>
            <TabsTrigger value="notes">
              Notas{view.notes.length ? ` (${view.notes.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="followups">Follow-ups</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
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
                <Field label="Cliente desde" value={date(view.createdAt)} mono />
              </div>
            </TabsContent>

            <TabsContent value="invoices">
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
            </TabsContent>

            <TabsContent value="notes">
              <div className="space-y-4">
                <NoteForm entityId={view.id} entityType="customer" onDone={refresh} />
                <NoteList notes={view.notes} onDone={refresh} />
              </div>
            </TabsContent>

            <TabsContent value="followups">
              <div className="space-y-3">
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
                <FollowUpForm entityId={view.id} entityType="customer" onDone={refresh} />
              </div>
            </TabsContent>

            <TabsContent value="audit">
              <AuditTimeline events={view.auditEvents} />
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
