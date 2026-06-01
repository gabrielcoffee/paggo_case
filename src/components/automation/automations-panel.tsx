"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Play, Trash2, Zap, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { dateTime } from "@/lib/format";
import { describeAutomation, FREQ_LABELS } from "@/lib/automation/automation-spec";
import {
  listAutomations,
  deleteAutomation,
  setAutomationEnabled,
  runAutomationNow,
} from "@/lib/actions/automations";
import type { AutomationSummary } from "@/lib/automation/automation-types";
import { AutomationForm } from "@/components/automation/automation-form";

export function AutomationsPanel({ today }: { today: string }) {
  const router = useRouter();
  const [rules, setRules] = useState<AutomationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setRules(await listAutomations());
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const rs = await listAutomations();
      if (alive) {
        setRules(rs);
        setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function run(id: string) {
    setBusy(id);
    try {
      const r = await runAutomationNow(id);
      if (r.ok) toast.success(r.summary || "Automação executada");
      else toast.error(r.summary || "Falha na execução");
      await load();
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function toggle(id: string, enabled: boolean) {
    await setAutomationEnabled(id, enabled);
    await load();
  }

  async function remove(id: string) {
    if (!(await confirm({ title: "Excluir automação", description: "Excluir esta automação e seu histórico? Esta ação não pode ser desfeita." })))
      return;
    setBusy(id);
    try {
      await deleteAutomation(id);
      await load();
      toast.success("Automação excluída");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
        <div>
          <h2 className="text-base font-semibold">Automações</h2>
          <p className="text-xs text-muted-foreground">
            Regras que conferem a carteira e agem sozinhas no horário marcado
          </p>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" /> Nova automação
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        {loading ? (
          <div className="flex justify-center pt-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : rules.length === 0 ? (
          <div className="mx-auto max-w-md pt-16 text-center">
            <Zap className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium">Nenhuma automação ainda</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Crie uma regra (ex.: clientes Enterprise vencidos há 30+ dias → agendar ligação toda semana)
              ou peça ao agente no chat.
            </p>
          </div>
        ) : (
          <ul className="mx-auto max-w-3xl space-y-3">
            {rules.map((r) => (
              <li key={r.id} className="rounded-lg border border-border bg-card">
                <div className="flex items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{r.name}</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium",
                          r.enabled ? "bg-chart-4/15 text-chart-4" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {r.enabled ? "Ativa" : "Pausada"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {describeAutomation({
                        target: r.target,
                        condition: r.condition,
                        effect: r.effect,
                        schedule: { frequency: r.frequency, startDate: r.startDate, timeOfDay: r.timeOfDay },
                      })}
                    </p>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {FREQ_LABELS[r.frequency]} às {r.timeOfDay} · próxima: {dateTime(r.nextRunAt)}
                      {r.lastRun && (
                        <>
                          {" · última: "}
                          <span className={r.lastRun.status === "failed" ? "text-destructive" : "text-foreground"}>
                            {r.lastRun.summary}
                          </span>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggle(r.id, !r.enabled)}
                      title={r.enabled ? "Pausar" : "Ativar"}
                      className={cn(
                        "relative h-5 w-9 rounded-full transition-colors",
                        r.enabled ? "bg-primary" : "bg-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-4 w-4 rounded-full bg-background transition-all",
                          r.enabled ? "left-[18px]" : "left-0.5",
                        )}
                      />
                    </button>
                    <Button size="sm" variant="ghost" onClick={() => run(r.id)} disabled={busy === r.id} title="Executar agora">
                      {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(r.id)} disabled={busy === r.id} title="Excluir">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <button
                      type="button"
                      onClick={() => setExpanded((e) => (e === r.id ? null : r.id))}
                      className="rounded p-1 text-muted-foreground hover:text-foreground"
                      title="Histórico"
                    >
                      <ChevronDown className={cn("h-4 w-4 transition-transform", expanded === r.id && "rotate-180")} />
                    </button>
                  </div>
                </div>

                {expanded === r.id && (
                  <RunHistory id={r.id} />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <AutomationForm open={formOpen} onOpenChange={setFormOpen} today={today} onCreated={load} />
    </div>
  );
}

function RunHistory({ id }: { id: string }) {
  const [runs, setRuns] = useState<{ id: string; runAt: string; trigger: string; status: string; summary: string }[] | null>(
    null,
  );
  useEffect(() => {
    let alive = true;
    import("@/lib/actions/automations").then(async ({ getAutomation }) => {
      const d = await getAutomation(id);
      if (alive) setRuns(d?.runs ?? []);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  if (!runs) return <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">Carregando…</div>;
  if (runs.length === 0)
    return <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">Sem execuções ainda.</div>;
  return (
    <ul className="border-t border-border px-4 py-2">
      {runs.map((run) => (
        <li key={run.id} className="flex items-center gap-2 py-1 text-[11px]">
          <span className={cn("h-1.5 w-1.5 rounded-full", run.status === "failed" ? "bg-destructive" : "bg-chart-4")} />
          <span className="font-mono tabular-nums text-muted-foreground">{dateTime(run.runAt)}</span>
          <span className="text-muted-foreground">({run.trigger === "scheduled" ? "agendada" : "manual"})</span>
          <span className="truncate">{run.summary}</span>
        </li>
      ))}
    </ul>
  );
}
