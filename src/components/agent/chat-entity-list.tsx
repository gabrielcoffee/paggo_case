"use client";

import { RiskBadge } from "@/components/risk-badge";
import { StatusChip } from "@/components/status-chip";
import { ScopeBadge } from "@/components/scope-badge";
import { brl, dateTime } from "@/lib/format";
import { SEGMENT_LABELS } from "@/lib/invoice-status";
import type { PanelTab } from "@/components/invoice-detail-panel";
import { cn } from "@/lib/utils";

export type EntitySelect = (sel: {
  kind: "invoice" | "customer";
  id: string;
  tab?: PanelTab;
}) => void;

type InvoiceItem = {
  id: string;
  cliente: string;
  seg: string;
  open: number;
  risco: number;
  status: string;
};
type CustomerItem = {
  id: string;
  nome: string;
  seg: string;
  openAr: number;
  overdueAr: number;
  overdueCount: number;
};
type NoteItem = {
  id: string;
  entityType: string;
  entityId: string;
  autor: string;
  texto: string;
  criadoEm: string;
};
type FollowUpItem = {
  id: string;
  entityType: string;
  entityId: string;
  canal: string;
  vencimento: string;
  status: string;
  descricao: string;
};

const CHANNEL_LABELS: Record<string, string> = {
  phone: "Telefone",
  email: "E-mail",
  whatsapp: "WhatsApp",
};

// Clickable rows for the structured lists the agent returns. Clicking opens the
// detail panel in the workspace (via onSelect), deep-linking to the right tab.
export function ChatEntityList({
  kind,
  data,
  tab,
  onSelect,
}: {
  kind: "invoice" | "customer" | "note" | "followup";
  data: unknown;
  tab?: PanelTab;
  onSelect?: EntitySelect;
}) {
  const rows = (Array.isArray(data) ? data : []) as unknown[];
  if (rows.length === 0) return null;

  // Notes/follow-ups reference an invoice OR a customer (entityType).
  const entityKind = (t: string): "invoice" | "customer" =>
    t === "customer" ? "customer" : "invoice";

  return (
    <ul className="divide-y divide-border">
      {kind === "invoice" &&
        (rows as InvoiceItem[]).map((r) => (
          <Row key={r.id} onClick={onSelect ? () => onSelect({ kind: "invoice", id: r.id, tab: tab ?? "overview" }) : undefined}>
            <div className="min-w-0">
              <div className="truncate font-medium">{r.cliente}</div>
              <div className="font-mono text-[11px] text-muted-foreground">
                {r.id} · {SEGMENT_LABELS[r.seg] ?? r.seg}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StatusChip status={r.status as never} />
              <span className="font-mono tabular-nums">{brl(r.open)}</span>
              <RiskBadge score={r.risco} />
            </div>
          </Row>
        ))}

      {kind === "customer" &&
        (rows as CustomerItem[]).map((r) => (
          <Row key={r.id} onClick={onSelect ? () => onSelect({ kind: "customer", id: r.id, tab: tab ?? "overview" }) : undefined}>
            <div className="min-w-0">
              <div className="truncate font-medium">{r.nome}</div>
              <div className="font-mono text-[11px] text-muted-foreground">
                {r.id} · {SEGMENT_LABELS[r.seg] ?? r.seg}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-mono tabular-nums text-destructive">{brl(r.overdueAr)}</div>
              <div className="text-[11px] text-muted-foreground">{r.overdueCount} vencidas</div>
            </div>
          </Row>
        ))}

      {kind === "note" &&
        (rows as NoteItem[]).map((r) => (
          <Row
            key={r.id}
            onClick={onSelect ? () => onSelect({ kind: entityKind(r.entityType), id: r.entityId, tab: "notes" }) : undefined}
          >
            <div className="min-w-0">
              <div className="truncate">{r.texto}</div>
              <div className="font-mono text-[11px] text-muted-foreground">
                {r.entityId} · {r.autor}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ScopeBadge entityType={r.entityType} />
              <span className="text-[11px] text-muted-foreground">{dateTime(r.criadoEm)}</span>
            </div>
          </Row>
        ))}

      {kind === "followup" &&
        (rows as FollowUpItem[]).map((r) => (
          <Row
            key={r.id}
            onClick={onSelect ? () => onSelect({ kind: entityKind(r.entityType), id: r.entityId, tab: "followups" }) : undefined}
          >
            <div className="min-w-0">
              <div className="truncate">{r.descricao}</div>
              <div className="font-mono text-[11px] text-muted-foreground">
                {r.entityId} · {CHANNEL_LABELS[r.canal] ?? r.canal}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ScopeBadge entityType={r.entityType} />
              <div className="text-right">
                <div className="font-mono text-[11px] tabular-nums">{dateTime(r.vencimento)}</div>
                <div className="text-[11px] text-muted-foreground">{r.status}</div>
              </div>
            </div>
          </Row>
        ))}
    </ul>
  );
}

function Row({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <li
      onClick={onClick}
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-2 text-sm",
        onClick && "cursor-pointer hover:bg-accent/50",
      )}
    >
      {children}
    </li>
  );
}
