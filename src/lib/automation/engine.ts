import { addDays } from "date-fns";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { buildWhere, type InvoiceQuery } from "@/lib/queries/invoices";
import { fetchCustomerDataset } from "@/lib/queries/customers";
import { appToday } from "@/lib/risk";
import { daysOverdue } from "@/lib/aging";
import { canTransition, SEGMENT_LABELS } from "@/lib/invoice-status";
import type { InvoiceStatus } from "@/generated/prisma/enums";
import { recordAudit } from "@/lib/audit";
import { brl } from "@/lib/format";
import { emailReport } from "@/lib/email/send-report";
import { computeNextRun } from "@/lib/automation/schedule";
import {
  effectSchema,
  scheduleSchema,
  invoiceConditionSchema,
  customerConditionSchema,
  renderTemplate,
  type Effect,
  type InvoiceCondition,
  type CustomerCondition,
} from "@/lib/automation/automation-spec";

// The execution engine. resolve* turn a condition into matched entities;
// apply*Effect run one effect on one entity (auditing it with origin
// "automation" + the rule id, which also powers dedup). runAutomation ties it
// together and advances the schedule.

const ORIGIN = "automation" as const;

type InvoiceMatch = {
  id: string;
  customerName: string;
  segment: string;
  open: number;
  daysOverdue: number;
  riskScore: number;
  status: string;
};

async function resolveInvoiceMatches(cond: InvoiceCondition): Promise<InvoiceMatch[]> {
  const today = appToday();
  const query: InvoiceQuery = {
    scope: cond.scope,
    status: cond.status,
    segment: cond.segment,
    method: [],
    aging: cond.aging as InvoiceQuery["aging"],
    minRisk: cond.minRisk,
    sort: "riskScore",
    dir: "desc",
    page: 1,
  };
  const recs = await prisma.invoice.findMany({
    where: buildWhere(query),
    orderBy: [{ riskScore: "desc" }, { id: "asc" }],
    take: 500,
    include: { customer: { select: { name: true, segment: true } } },
  });
  return recs
    .map((r) => ({
      id: r.id,
      customerName: r.customer.name,
      segment: r.customer.segment,
      open: Number(r.amount) - Number(r.amountPaid),
      daysOverdue: daysOverdue(r.dueDate, today),
      riskScore: r.riskScore,
      status: r.status,
    }))
    .filter((m) => m.open >= cond.minOpen && m.daysOverdue >= cond.minDaysOverdue);
}

async function resolveCustomerMatches(cond: CustomerCondition) {
  const { rows } = await fetchCustomerDataset();
  return rows.filter(
    (r) =>
      (!cond.segment.length || cond.segment.includes(r.segment)) &&
      r.openAr >= cond.minOpenAr &&
      r.overdueAr >= cond.minOverdueAr &&
      r.overdueCount >= cond.minOverdueCount,
  );
}

// Has this rule already acted on this entity since `since`? Prevents re-running
// "Executar agora" (or an overlapping schedule) from duplicating the same write.
async function alreadyActed(
  ruleId: string,
  entityType: string,
  entityId: string,
  since: Date,
): Promise<boolean> {
  const dup = await prisma.auditEvent.findFirst({
    where: {
      actor: ORIGIN,
      entityType,
      entityId,
      timestamp: { gte: since },
      payload: { path: ["automationId"], equals: ruleId },
    },
    select: { id: true },
  });
  return !!dup;
}

async function applyInvoiceEffect(ruleId: string, effect: Effect, m: InvoiceMatch): Promise<boolean> {
  const vars = {
    cliente: m.customerName,
    fatura: m.id,
    valor_aberto: brl(m.open),
    dias_atraso: String(m.daysOverdue),
    segmento: SEGMENT_LABELS[m.segment] ?? m.segment,
    risco: String(m.riskScore),
  };
  const audit = (tx: Prisma.TransactionClient, action: string, payload: object) =>
    recordAudit(tx, { entityType: "invoice", entityId: m.id, action, origin: ORIGIN, actor: ORIGIN, payload: { ...payload, automationId: ruleId } });

  if (effect.kind === "note") {
    await prisma.$transaction(async (tx) => {
      await tx.note.create({ data: { entityType: "invoice", entityId: m.id, author: ORIGIN, body: renderTemplate(effect.bodyTemplate, vars) } });
      await audit(tx, "note_added", { via: "automation" });
    });
    return true;
  }
  if (effect.kind === "followup") {
    await prisma.$transaction(async (tx) => {
      await tx.followUp.create({
        data: {
          entityType: "invoice",
          entityId: m.id,
          dueAt: addDays(appToday(), effect.dueOffsetDays),
          channel: effect.channel,
          body: renderTemplate(effect.bodyTemplate, vars),
          assignee: effect.assignee || null,
          status: "pending",
          createdBy: ORIGIN,
        },
      });
      await audit(tx, "followup_scheduled", { channel: effect.channel });
    });
    return true;
  }
  if (effect.kind === "status") {
    if (!canTransition(m.status as InvoiceStatus, effect.to as InvoiceStatus)) return false;
    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id: m.id }, data: { status: effect.to } });
      await audit(tx, "status_change", { from: m.status, to: effect.to });
    });
    return true;
  }
  return false; // report_email handled at the run level
}

async function applyCustomerEffect(
  ruleId: string,
  effect: Effect,
  m: { id: string; name: string; segment: string; openAr: number; overdueAr: number; overdueCount: number },
): Promise<boolean> {
  const vars = {
    cliente: m.name,
    valor_aberto: brl(m.overdueAr || m.openAr),
    qtd_vencidas: String(m.overdueCount),
    segmento: SEGMENT_LABELS[m.segment] ?? m.segment,
  };
  const audit = (tx: Prisma.TransactionClient, action: string, payload: object) =>
    recordAudit(tx, { entityType: "customer", entityId: m.id, action, origin: ORIGIN, actor: ORIGIN, payload: { ...payload, automationId: ruleId } });

  if (effect.kind === "note") {
    await prisma.$transaction(async (tx) => {
      await tx.note.create({ data: { entityType: "customer", entityId: m.id, author: ORIGIN, body: renderTemplate(effect.bodyTemplate, vars) } });
      await audit(tx, "note_added", { via: "automation" });
    });
    return true;
  }
  if (effect.kind === "followup") {
    await prisma.$transaction(async (tx) => {
      await tx.followUp.create({
        data: {
          entityType: "customer",
          entityId: m.id,
          dueAt: addDays(appToday(), effect.dueOffsetDays),
          channel: effect.channel,
          body: renderTemplate(effect.bodyTemplate, vars),
          assignee: effect.assignee || null,
          status: "pending",
          createdBy: ORIGIN,
        },
      });
      await audit(tx, "followup_scheduled", { channel: effect.channel });
    });
    return true;
  }
  return false; // status not valid for customers
}

// Live preview for the form: how many entities match a condition right now.
export async function countMatches(target: string, condition: unknown): Promise<number> {
  if (target === "invoice") return (await resolveInvoiceMatches(invoiceConditionSchema.parse(condition ?? {}))).length;
  return (await resolveCustomerMatches(customerConditionSchema.parse(condition ?? {}))).length;
}

export type RunResult = { ok: boolean; matched: number; acted: number; summary: string };

export async function runAutomation(
  ruleId: string,
  trigger: "manual" | "scheduled",
): Promise<RunResult> {
  const rule = await prisma.automationRule.findUnique({ where: { id: ruleId } });
  if (!rule) return { ok: false, matched: 0, acted: 0, summary: "Automação não encontrada." };

  const effect = effectSchema.parse(rule.effect);
  const now = new Date();
  let matched = 0;
  let acted = 0;
  let status: "success" | "failed" = "success";
  let summary = "";

  try {
    if (effect.kind === "report_email") {
      if (!effect.to) throw new Error("Automação sem destinatário de email.");
      const res = await emailReport(effect.to, effect.reportConfig);
      if (!res.ok) throw new Error(res.error);
      matched = 1;
      acted = 1;
      summary = `Relatório enviado para ${effect.to}`;
    } else {
      const since = rule.lastRunAt ?? new Date(0);
      if (rule.target === "invoice") {
        const matches = await resolveInvoiceMatches(invoiceConditionSchema.parse(rule.condition));
        matched = matches.length;
        for (const m of matches) {
          if (await alreadyActed(rule.id, "invoice", m.id, since)) continue;
          if (await applyInvoiceEffect(rule.id, effect, m)) acted++;
        }
      } else {
        const matches = await resolveCustomerMatches(customerConditionSchema.parse(rule.condition));
        matched = matches.length;
        for (const m of matches) {
          if (await alreadyActed(rule.id, "customer", m.id, since)) continue;
          if (await applyCustomerEffect(rule.id, effect, m)) acted++;
        }
      }
      summary = `${matched} correspondência(s) · ${acted} ação(ões) aplicada(s)`;
    }
  } catch (e) {
    status = "failed";
    summary = (e as Error).message;
  }

  const next = computeNextRun(
    scheduleSchema.parse({
      frequency: rule.frequency,
      startDate: rule.startDate.toISOString().slice(0, 10),
      timeOfDay: rule.timeOfDay,
    }),
    now,
  );

  await prisma.$transaction([
    prisma.automationRun.create({ data: { automationId: rule.id, trigger, status, matched, acted, summary } }),
    prisma.automationRule.update({ where: { id: rule.id }, data: { lastRunAt: now, nextRunAt: next } }),
  ]);

  for (const p of ["/", "/invoices", "/customers", "/notes", "/followups", "/agreements", "/agent"]) revalidatePath(p);

  return { ok: status === "success", matched, acted, summary };
}

// Runs every enabled rule whose nextRunAt is due. Called by the cron route.
export async function runDueAutomations(now: Date): Promise<{ ran: number }> {
  const due = await prisma.automationRule.findMany({
    where: { enabled: true, nextRunAt: { lte: now } },
    select: { id: true },
  });
  for (const r of due) await runAutomation(r.id, "scheduled");
  return { ran: due.length };
}
