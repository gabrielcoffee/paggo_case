import { cn } from "@/lib/utils";
import { dateTime } from "@/lib/format";
import type { DetailAudit } from "@/lib/actions/invoice-detail";

const ACTION_LABELS: Record<string, string> = {
  status_change: "Mudança de status",
  note_added: "Nota adicionada",
  note_updated: "Nota atualizada",
  note_deleted: "Nota excluída",
  followup_scheduled: "Follow-up agendado",
  followup_deleted: "Follow-up excluído",
  agreement_created: "Acordo criado",
  agreement_updated: "Acordo atualizado",
  agreement_deleted: "Acordo excluído",
  automation_created: "Automação criada",
};

const ORIGIN_LABELS: Record<string, string> = {
  analyst: "Analista",
  agent: "Agente",
  automation: "Automação",
};

function summarize(e: DetailAudit): string | null {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  if (e.action === "status_change") return `${p.from} → ${p.to}`;
  if (e.action === "agreement_created") return `${p.installments}x`;
  if (e.action === "followup_scheduled") return String(p.channel ?? "");
  return null;
}

export function AuditTimeline({ events }: { events: DetailAudit[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>;
  }
  return (
    <ol className="relative space-y-3 border-l border-border pl-4">
      {events.map((e) => {
        const detail = summarize(e);
        return (
          <li key={e.id} className="relative">
            <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-primary ring-2 ring-card" />
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {ACTION_LABELS[e.action] ?? e.action}
              </span>
              <OriginBadge origin={e.origin} />
            </div>
            {detail && (
              <div className="font-mono text-xs text-muted-foreground">{detail}</div>
            )}
            <div className="text-[11px] text-muted-foreground">
              {dateTime(e.timestamp)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function OriginBadge({ origin }: { origin: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        origin === "agent"
          ? "bg-chart-2/15 text-chart-2"
          : "bg-secondary text-secondary-foreground",
      )}
    >
      {ORIGIN_LABELS[origin] ?? origin}
    </span>
  );
}
