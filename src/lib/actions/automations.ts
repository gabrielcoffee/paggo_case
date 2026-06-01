"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getUser } from "@/lib/supabase/server";
import {
  automationSpecSchema,
  effectSchema,
  parseCondition,
  type Schedule,
  type Effect,
  type Target,
} from "@/lib/automation/automation-spec";
import { computeNextRun } from "@/lib/automation/schedule";
import { runAutomation } from "@/lib/automation/engine";
import type {
  AutomationSummary,
  AutomationDetail,
  AutomationRunInfo,
} from "@/lib/automation/automation-types";

export type AutomationResult = { ok: true; id: string } | { ok: false; error: string };

async function actor(): Promise<string> {
  const u = await getUser();
  return u?.email ?? "analyst";
}

// Shared by the manual form and the chat agent's confirmation. Validates the
// spec, fills the report recipient from the session if absent, computes the
// first run, and persists the rule.
export async function createAutomation(input: unknown): Promise<AutomationResult> {
  const parsed = automationSpecSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const spec = parsed.data;

  const condition = parseCondition(spec.target, spec.condition);

  let effect: Effect = spec.effect;
  if (effect.kind === "report_email" && !effect.to) {
    const u = await getUser();
    if (!u?.email) return { ok: false, error: "Sem email de destino para o relatório." };
    effect = { ...effect, to: u.email };
  }

  const nextRunAt = computeNextRun(spec.schedule, new Date());

  const rule = await prisma.automationRule.create({
    data: {
      name: spec.name,
      target: spec.target,
      condition: condition as object,
      effect: effect as object,
      frequency: spec.schedule.frequency,
      startDate: new Date(spec.schedule.startDate),
      timeOfDay: spec.schedule.timeOfDay,
      nextRunAt,
      createdBy: await actor(),
    },
  });

  revalidatePath("/agent");
  return { ok: true, id: rule.id };
}

function runInfo(r: {
  id: string;
  runAt: Date;
  trigger: string;
  status: string;
  matched: number;
  acted: number;
  summary: string;
}): AutomationRunInfo {
  return {
    id: r.id,
    runAt: r.runAt.toISOString(),
    trigger: r.trigger,
    status: r.status,
    matched: r.matched,
    acted: r.acted,
    summary: r.summary,
  };
}

export async function listAutomations(): Promise<AutomationSummary[]> {
  const rules = await prisma.automationRule.findMany({
    orderBy: { createdAt: "desc" },
    include: { runs: { orderBy: { runAt: "desc" }, take: 1 } },
  });
  return rules.map((r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    target: r.target as Target,
    condition: r.condition,
    effect: effectSchema.parse(r.effect),
    frequency: r.frequency as Schedule["frequency"],
    startDate: r.startDate.toISOString().slice(0, 10),
    timeOfDay: r.timeOfDay,
    nextRunAt: r.nextRunAt.toISOString(),
    lastRunAt: r.lastRunAt ? r.lastRunAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    lastRun: r.runs[0] ? runInfo(r.runs[0]) : null,
  }));
}

export async function getAutomation(id: string): Promise<AutomationDetail | null> {
  const r = await prisma.automationRule.findUnique({
    where: { id },
    include: { runs: { orderBy: { runAt: "desc" }, take: 20 } },
  });
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    target: r.target as Target,
    condition: r.condition,
    effect: effectSchema.parse(r.effect),
    frequency: r.frequency as Schedule["frequency"],
    startDate: r.startDate.toISOString().slice(0, 10),
    timeOfDay: r.timeOfDay,
    nextRunAt: r.nextRunAt.toISOString(),
    lastRunAt: r.lastRunAt ? r.lastRunAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    lastRun: r.runs[0] ? runInfo(r.runs[0]) : null,
    runs: r.runs.map(runInfo),
  };
}

export async function deleteAutomation(id: string): Promise<{ ok: boolean }> {
  await prisma.automationRule.delete({ where: { id } }); // cascades runs
  revalidatePath("/agent");
  return { ok: true };
}

export async function setAutomationEnabled(id: string, enabled: boolean): Promise<{ ok: boolean }> {
  await prisma.automationRule.update({ where: { id }, data: { enabled } });
  revalidatePath("/agent");
  return { ok: true };
}

export async function runAutomationNow(id: string) {
  const res = await runAutomation(id, "manual");
  revalidatePath("/agent");
  return res;
}
