"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, X, Undo2, ClipboardList } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeStep, type PlanStep } from "@/lib/agent/plan-steps";
import { confirmPlan, rejectPlan } from "@/lib/actions/agent-plan";

export type PlanData = { id: string; summary: string; steps: PlanStep[]; status: string };

const STATUS_LABEL: Record<string, string> = {
  pending: "pendente",
  executed: "executado",
  rejected: "rejeitado",
  failed: "falhou",
};

export function PlanModal({
  plan,
  onStatus,
}: {
  plan: PlanData;
  onStatus: (planId: string, status: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dropped, setDropped] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const kept = useMemo(
    () => plan.steps.map((_, i) => i).filter((i) => !dropped.has(i)),
    [plan.steps, dropped],
  );
  const decided = plan.status !== "pending";

  function toggle(i: number) {
    setDropped((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
          <ClipboardList className="h-3.5 w-3.5" /> Plano · {plan.steps.length} ação(ões)
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {STATUS_LABEL[plan.status] ?? plan.status}
        </span>
      </div>
      <p className="mt-1 text-sm">{plan.summary}</p>
      {!decided && (
        <Button size="sm" className="mt-2" onClick={() => setOpen(true)}>
          Revisar e confirmar
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmar ações</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{plan.summary}</p>
          <p className="text-xs text-muted-foreground">
            Remova com o ✕ qualquer ação que não quer executar. Só as mantidas serão aplicadas.
          </p>

          <ul className="max-h-72 space-y-1 overflow-auto">
            {plan.steps.map((s, i) => {
              const off = dropped.has(i);
              return (
                <li
                  key={i}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm",
                    off ? "border-border bg-muted/40 text-muted-foreground line-through" : "border-border",
                  )}
                >
                  <span className="min-w-0 truncate">{describeStep(s)}</span>
                  <button
                    onClick={() => toggle(i)}
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label={off ? "Restaurar" : "Remover"}
                  >
                    {off ? <Undo2 className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  </button>
                </li>
              );
            })}
          </ul>

          {err && <p className="text-xs text-destructive">{err}</p>}

          <div className="flex gap-2">
            <Button
              loading={pending}
              disabled={pending || kept.length === 0}
              onClick={() =>
                start(async () => {
                  setErr(null);
                  const r = await confirmPlan(plan.id, kept);
                  if (r.ok) {
                    setOpen(false);
                    onStatus(plan.id, "executed");
                  } else setErr(r.error);
                })
              }
            >
              <Check className="h-3.5 w-3.5" /> Confirmar ({kept.length} de {plan.steps.length})
            </Button>
            <Button
              variant="outline"
              loading={pending}
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await rejectPlan(plan.id);
                  if (r.ok) {
                    setOpen(false);
                    onStatus(plan.id, "rejected");
                  } else setErr(r.error);
                })
              }
            >
              Rejeitar tudo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
