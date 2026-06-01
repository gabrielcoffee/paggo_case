"use client";

import { RiskBadge } from "@/components/risk-badge";
import { StatusChip } from "@/components/status-chip";
import { brl } from "@/lib/format";
import { SEGMENT_LABELS } from "@/lib/invoice-status";
import { cn } from "@/lib/utils";

export type EntitySelect = (kind: "invoice" | "customer", id: string) => void;

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

// Clickable rows for invoice/customer lists returned by the agent. Clicking opens
// the detail panel in the workspace (via onSelect). Renders inert if no onSelect.
export function ChatEntityList({
  kind,
  data,
  onSelect,
}: {
  kind: "invoice" | "customer";
  data: unknown;
  onSelect?: EntitySelect;
}) {
  const rows = (Array.isArray(data) ? data : []) as (InvoiceItem | CustomerItem)[];
  if (rows.length === 0) return null;

  return (
    <ul className="divide-y divide-border">
      {kind === "invoice"
        ? (rows as InvoiceItem[]).map((r) => (
            <Row key={r.id} onClick={onSelect ? () => onSelect("invoice", r.id) : undefined}>
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
          ))
        : (rows as CustomerItem[]).map((r) => (
            <Row key={r.id} onClick={onSelect ? () => onSelect("customer", r.id) : undefined}>
              <div className="min-w-0">
                <div className="truncate font-medium">{r.nome}</div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {r.id} · {SEGMENT_LABELS[r.seg] ?? r.seg}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-right">
                <div>
                  <div className="font-mono tabular-nums text-destructive">{brl(r.overdueAr)}</div>
                  <div className="text-[11px] text-muted-foreground">{r.overdueCount} vencidas</div>
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
