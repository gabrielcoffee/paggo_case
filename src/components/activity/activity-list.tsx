"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { InvoiceDetailPanel, type PanelTab } from "@/components/invoice-detail-panel";
import { CustomerDetailPanel } from "@/components/customer-detail-panel";
import { ScopeBadge } from "@/components/scope-badge";
import { prefetchDetail } from "@/lib/detail-cache";
import { prefetchCustomer } from "@/lib/customer-detail-cache";
import { brl, dateTime } from "@/lib/format";
import type {
  ActivityNote,
  ActivityFollowUp,
  ActivityAgreement,
} from "@/lib/queries/activity";

const CHANNEL_LABELS: Record<string, string> = {
  phone: "Telefone",
  email: "E-mail",
  whatsapp: "WhatsApp",
};

type Sel = { kind: "invoice" | "customer"; id: string; tab: PanelTab } | null;

type Props =
  | { kind: "notes"; title: string; rows: ActivityNote[]; today: string }
  | { kind: "followups"; title: string; rows: ActivityFollowUp[]; today: string }
  | { kind: "agreements"; title: string; rows: ActivityAgreement[]; today: string };

const thCls = "[&>th]:px-3 [&>th]:py-2.5 [&>th]:text-left [&>th]:font-medium";
const rowCls =
  "cursor-pointer border-b border-border/60 transition-colors hover:bg-accent/40 [&>td]:px-3 [&>td]:py-2.5";

export function ActivityList(props: Props) {
  const { title, today } = props;
  const [sel, setSel] = useState<Sel>(null);

  function open(entityType: string, id: string, tab: PanelTab) {
    const kind = entityType === "customer" ? "customer" : "invoice";
    if (kind === "invoice") prefetchDetail(id);
    else prefetchCustomer(id);
    setSel({ kind, id, tab });
  }

  const total = props.rows.length;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
        <div>
          <h1 className="text-base font-semibold">{title}</h1>
          <p className="text-xs text-muted-foreground">Últimos registros da carteira</p>
        </div>
        <span className="text-xs text-muted-foreground">
          <span className="font-mono font-semibold tabular-nums text-foreground">{total}</span>{" "}
          registros
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-4">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground shadow-[0_1px_0_0_var(--border)]">
            {props.kind === "notes" && (
              <tr className={thCls}>
                <th>Nota</th>
                <th>Entidade</th>
                <th>Autor</th>
                <th>Criado</th>
              </tr>
            )}
            {props.kind === "followups" && (
              <tr className={thCls}>
                <th>Follow-up</th>
                <th>Entidade</th>
                <th>Canal</th>
                <th>Vencimento</th>
                <th>Status</th>
              </tr>
            )}
            {props.kind === "agreements" && (
              <tr className={thCls}>
                <th>Fatura</th>
                <th>Cliente</th>
                <th className="text-right!">Parcelas</th>
                <th className="text-right!">Total</th>
                <th>Criado</th>
              </tr>
            )}
          </thead>
          <tbody>
            {props.kind === "notes" &&
              props.rows.map((n) => (
                <tr key={n.id} className={rowCls} onClick={() => open(n.entityType, n.entityId, "notes")}>
                  <td className="max-w-[420px]">
                    <span className="block truncate">{n.texto}</span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <ScopeBadge entityType={n.entityType} />
                      <span className="truncate">{n.cliente}</span>
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">{n.entityId}</span>
                  </td>
                  <td className="text-xs">{n.autor}</td>
                  <td className="whitespace-nowrap font-mono text-xs tabular-nums">{dateTime(n.criadoEm)}</td>
                </tr>
              ))}

            {props.kind === "followups" &&
              props.rows.map((f) => (
                <tr key={f.id} className={rowCls} onClick={() => open(f.entityType, f.entityId, "followups")}>
                  <td className="max-w-[360px]">
                    <span className="block truncate">{f.descricao}</span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <ScopeBadge entityType={f.entityType} />
                      <span className="truncate">{f.cliente}</span>
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">{f.entityId}</span>
                  </td>
                  <td className="text-xs">{CHANNEL_LABELS[f.canal] ?? f.canal}</td>
                  <td className="whitespace-nowrap font-mono text-xs tabular-nums">{dateTime(f.vencimento)}</td>
                  <td className="text-xs text-muted-foreground">{f.status}</td>
                </tr>
              ))}

            {props.kind === "agreements" &&
              props.rows.map((a) => (
                <tr key={a.id} className={rowCls} onClick={() => open("invoice", a.fatura, "agreement")}>
                  <td className="font-mono text-xs text-muted-foreground">{a.fatura}</td>
                  <td>
                    <span className="block truncate">{a.cliente}</span>
                  </td>
                  <td className="text-right font-mono tabular-nums">{a.parcelas}x</td>
                  <td className="text-right font-mono tabular-nums">{brl(a.total)}</td>
                  <td className="whitespace-nowrap font-mono text-xs tabular-nums">{dateTime(a.criadoEm)}</td>
                </tr>
              ))}

            {total === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-16 text-center text-sm text-muted-foreground">
                  Nada por aqui ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Sheet open={sel?.kind === "invoice"} onClose={() => setSel(null)}>
        {sel?.kind === "invoice" && (
          <InvoiceDetailPanel
            key={`${sel.id}:${sel.tab}`}
            id={sel.id}
            today={today}
            initialTab={sel.tab}
            onClose={() => setSel(null)}
          />
        )}
      </Sheet>
      <Sheet open={sel?.kind === "customer"} onClose={() => setSel(null)}>
        {sel?.kind === "customer" && (
          <CustomerDetailPanel
            key={`${sel.id}:${sel.tab}`}
            id={sel.id}
            today={today}
            initialTab={sel.tab}
            onClose={() => setSel(null)}
            onOpenInvoice={(invId) => {
              prefetchDetail(invId);
              setSel({ kind: "invoice", id: invId, tab: "overview" });
            }}
          />
        )}
      </Sheet>
    </div>
  );
}
