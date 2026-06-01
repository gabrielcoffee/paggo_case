"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { canTransition } from "@/lib/invoice-status";
import { recordAudit } from "@/lib/audit";
import { recomputeInvoiceRisk } from "@/lib/risk-recompute";
import { buildSchedule } from "@/lib/agreement";
import { appToday } from "@/lib/risk";
import { getUser } from "@/lib/supabase/server";
import { planStepsSchema, type PlanStep } from "@/lib/agent/plan-steps";
import { parseCondition } from "@/lib/automation/automation-spec";
import { computeNextRun } from "@/lib/automation/schedule";
import type { ActionResult } from "@/lib/actions/invoices";

const AGENT = { origin: "agent" as const, actor: "agent" };

// Executes one proposed step inside the caller's transaction, emitting an
// agent-attributed audit event that references the plan.
async function execStep(tx: Prisma.TransactionClient, step: PlanStep, planId: string) {
  // Automation creation has no invoice target — handle it before the invoice
  // audit closure below (which assumes step.invoiceId).
  if (step.kind === "automation") {
    const spec = step.spec;
    const condition = parseCondition(spec.target, spec.condition);
    let effect = spec.effect;
    if (effect.kind === "report_email" && !effect.to) {
      const u = await getUser();
      effect = { ...effect, to: u?.email };
    }
    const rule = await tx.automationRule.create({
      data: {
        name: spec.name,
        target: spec.target,
        condition: condition as object,
        effect: effect as object,
        frequency: spec.schedule.frequency,
        startDate: new Date(spec.schedule.startDate),
        timeOfDay: spec.schedule.timeOfDay,
        nextRunAt: computeNextRun(spec.schedule, new Date()),
        createdBy: AGENT.actor,
      },
    });
    await recordAudit(tx, {
      entityType: "automation",
      entityId: rule.id,
      action: "automation_created",
      origin: AGENT.origin,
      actor: AGENT.actor,
      payload: { planId, name: spec.name },
    });
    return;
  }

  const audit = (action: string, payload: Prisma.InputJsonValue) =>
    recordAudit(tx, {
      entityType: "invoice",
      entityId: step.invoiceId,
      action,
      origin: AGENT.origin,
      actor: AGENT.actor,
      payload: { ...(payload as object), planId },
    });

  if (step.kind === "note") {
    await tx.note.create({
      data: { entityType: "invoice", entityId: step.invoiceId, author: AGENT.actor, body: step.body },
    });
    await audit("note_added", { via: "agent_plan" });
    return;
  }

  if (step.kind === "followup") {
    await tx.followUp.create({
      data: {
        entityType: "invoice",
        entityId: step.invoiceId,
        dueAt: new Date(step.dueAt),
        channel: step.channel,
        body: step.body,
        status: "pending",
        createdBy: AGENT.actor,
      },
    });
    await audit("followup_scheduled", { channel: step.channel });
    return;
  }

  // status / writeoff / agreement need the current invoice.
  const inv = await tx.invoice.findUnique({ where: { id: step.invoiceId } });
  if (!inv) throw new Error(`Fatura ${step.invoiceId} não encontrada`);

  if (step.kind === "status" || step.kind === "writeoff") {
    const to = step.kind === "writeoff" ? "written_off" : step.to;
    if (inv.status === to) throw new Error(`${step.invoiceId} já está em ${to}`);
    if (!canTransition(inv.status, to))
      throw new Error(`Transição inválida ${inv.status} → ${to} (${step.invoiceId})`);
    const markingPaid = to === "paid";
    await tx.invoice.update({
      where: { id: step.invoiceId },
      data: markingPaid
        ? { status: to, paymentStatus: "paid", amountPaid: inv.amount, paidDate: appToday() }
        : { status: to },
    });
    if (markingPaid) await recomputeInvoiceRisk(tx, step.invoiceId);
    if (step.kind === "status" && step.note) {
      await tx.note.create({
        data: { entityType: "invoice", entityId: step.invoiceId, author: AGENT.actor, body: step.note },
      });
    }
    await audit("status_change", { from: inv.status, to });
    return;
  }

  // agreement
  const baseCents = Math.round((Number(inv.amount) - Number(inv.amountPaid)) * 100);
  if (baseCents <= 0) throw new Error(`${step.invoiceId} sem saldo em aberto`);
  const move = inv.status !== "agreement_signed" && canTransition(inv.status, "agreement_signed");
  if (inv.status !== "agreement_signed" && !move)
    throw new Error(`Não é possível firmar acordo a partir de ${inv.status} (${step.invoiceId})`);
  const schedule = buildSchedule({
    baseCents,
    installments: step.installments,
    discountPct: step.discountPct,
    feePct: step.feePct,
    firstDueDate: step.firstDueDate,
    intervalDays: step.intervalDays,
  });
  const agreement = await tx.paymentAgreement.create({
    data: {
      originalInvoiceId: step.invoiceId,
      installments: step.installments,
      discountPct: step.discountPct != null ? new Prisma.Decimal(step.discountPct) : null,
      feePct: step.feePct != null ? new Prisma.Decimal(step.feePct) : null,
      createdBy: AGENT.actor,
      installmentRows: {
        create: schedule.rows.map((r) => ({
          installmentNumber: r.installmentNumber,
          dueDate: new Date(r.dueDate),
          amount: new Prisma.Decimal(r.amountCents).dividedBy(100),
          status: "open",
        })),
      },
    },
  });
  if (move)
    await tx.invoice.update({ where: { id: step.invoiceId }, data: { status: "agreement_signed" } });
  await audit("agreement_created", { agreementId: agreement.id, totalCents: schedule.totalCents });
}

// keptIndexes lets the analyst drop specific actions in the confirm modal before
// executing. Omitted → run all steps. Only the kept steps run and are audited.
export async function confirmPlan(
  planId: string,
  keptIndexes?: number[],
): Promise<ActionResult> {
  const plan = await prisma.agentPlan.findUnique({ where: { id: planId } });
  if (!plan) return { ok: false, error: "Plano não encontrado." };
  if (plan.status !== "pending") return { ok: false, error: "Plano já foi processado." };

  const parsed = planStepsSchema.safeParse(plan.steps);
  if (!parsed.success) return { ok: false, error: "Passos do plano inválidos." };
  const allSteps = parsed.data;

  const kept =
    keptIndexes === undefined
      ? allSteps
      : keptIndexes
          .filter((i) => Number.isInteger(i) && i >= 0 && i < allSteps.length)
          .map((i) => allSteps[i]);

  if (kept.length === 0) return { ok: false, error: "Nenhuma ação selecionada." };

  try {
    await prisma.$transaction(async (tx) => {
      for (const step of kept) await execStep(tx, step, planId);
    });
  } catch (e) {
    await prisma.agentPlan.update({
      where: { id: planId },
      data: { status: "failed", result: { error: (e as Error).message } },
    });
    return { ok: false, error: (e as Error).message };
  }

  await prisma.agentPlan.update({
    where: { id: planId },
    data: {
      status: "executed",
      executedAt: new Date(),
      result: { executed: kept.length, of: allSteps.length },
    },
  });
  revalidatePath("/invoices");
  revalidatePath("/");
  revalidatePath("/agent");
  return { ok: true };
}

// Current statuses for a set of plans — used to reconcile cards after a reload
// (a stored chat message holds the status as it was when saved).
export async function getPlanStatuses(planIds: string[]): Promise<Record<string, string>> {
  if (planIds.length === 0) return {};
  const rows = await prisma.agentPlan.findMany({
    where: { id: { in: planIds } },
    select: { id: true, status: true },
  });
  return Object.fromEntries(rows.map((r) => [r.id, r.status]));
}

export async function rejectPlan(planId: string): Promise<ActionResult> {
  const plan = await prisma.agentPlan.findUnique({ where: { id: planId } });
  if (!plan) return { ok: false, error: "Plano não encontrado." };
  if (plan.status !== "pending") return { ok: false, error: "Plano já foi processado." };
  await prisma.agentPlan.update({ where: { id: planId }, data: { status: "rejected" } });
  return { ok: true };
}
