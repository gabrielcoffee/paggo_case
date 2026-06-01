import { z } from "zod";
import { reportConfigSchema, PRESET_LABELS } from "@/lib/report/report-config";
import { SEGMENT_LABELS, STATUS_LABELS } from "@/lib/invoice-status";
import { AGING_LABELS } from "@/lib/aging";

// Single source of truth for an automation's shape. One schema drives the agent
// tool, the manual form, validation, and the engine — the many "combinations"
// (causes × effects × schedules) are data here, not separate code paths.

export const TARGETS = ["invoice", "customer"] as const;
export type Target = (typeof TARGETS)[number];

// --- condition (cause) ---------------------------------------------------

export const invoiceConditionSchema = z.object({
  scope: z.enum(["unpaid", "overdue", "all"]).default("overdue"),
  segment: z.array(z.string()).default([]),
  status: z.array(z.string()).default([]),
  aging: z.array(z.string()).default([]),
  minRisk: z.number().min(0).max(100).default(0),
  minOpen: z.number().min(0).default(0),
  minDaysOverdue: z.number().min(0).max(3650).default(0),
});
export type InvoiceCondition = z.infer<typeof invoiceConditionSchema>;

export const customerConditionSchema = z.object({
  segment: z.array(z.string()).default([]),
  minOpenAr: z.number().min(0).default(0),
  minOverdueAr: z.number().min(0).default(0),
  minOverdueCount: z.number().int().min(0).default(0),
});
export type CustomerCondition = z.infer<typeof customerConditionSchema>;

// --- effect --------------------------------------------------------------

export const CHANNELS = ["phone", "email", "whatsapp"] as const;
export const STATUS_TARGETS = ["in_negotiation", "disputed", "written_off"] as const;

export const effectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("note"), bodyTemplate: z.string().trim().min(1).max(2000) }),
  z.object({
    kind: z.literal("followup"),
    channel: z.enum(CHANNELS),
    dueOffsetDays: z.number().int().min(0).max(365).default(1),
    bodyTemplate: z.string().trim().min(1).max(2000),
    assignee: z.string().trim().max(120).optional(),
  }),
  z.object({ kind: z.literal("status"), to: z.enum(STATUS_TARGETS) }),
  z.object({
    kind: z.literal("report_email"),
    reportConfig: reportConfigSchema,
    to: z.string().email().optional(),
  }),
]);
export type Effect = z.infer<typeof effectSchema>;
export type EffectKind = Effect["kind"];

// --- schedule ------------------------------------------------------------
// Cadence is derived from startDate (weekly = same weekday, monthly = same day).

export const scheduleSchema = z.object({
  frequency: z.enum(["weekly", "monthly"]),
  startDate: z.string().min(1), // yyyy-mm-dd
  timeOfDay: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default("10:00"),
});
export type Schedule = z.infer<typeof scheduleSchema>;

// --- full spec -----------------------------------------------------------

export const automationSpecSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    target: z.enum(TARGETS),
    condition: z.record(z.string(), z.unknown()),
    effect: effectSchema,
    schedule: scheduleSchema,
  })
  .superRefine((spec, ctx) => {
    if (spec.effect.kind === "status" && spec.target !== "invoice") {
      ctx.addIssue({ code: "custom", message: "Mudança de status só vale para faturas.", path: ["effect"] });
    }
  });
export type AutomationSpec = z.infer<typeof automationSpecSchema>;

// Parse the loose condition record into the typed condition for the target.
export function parseCondition(target: Target, condition: unknown) {
  return target === "invoice"
    ? invoiceConditionSchema.parse(condition ?? {})
    : customerConditionSchema.parse(condition ?? {});
}

// --- templates -----------------------------------------------------------

export const INVOICE_VARS = ["cliente", "fatura", "valor_aberto", "dias_atraso", "segmento", "risco"] as const;
export const CUSTOMER_VARS = ["cliente", "valor_aberto", "qtd_vencidas", "segmento"] as const;

export function templateVars(target: Target): readonly string[] {
  return target === "invoice" ? INVOICE_VARS : CUSTOMER_VARS;
}

export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

// --- human-readable summaries (UI + agent recap) -------------------------

const FREQ_LABELS: Record<Schedule["frequency"], string> = {
  weekly: "toda semana",
  monthly: "todo mês",
};

const EFFECT_LABELS: Record<EffectKind, string> = {
  note: "escrever nota",
  followup: "agendar follow-up",
  status: "mudar status",
  report_email: "enviar relatório por email",
};

export function describeCondition(target: Target, conditionRaw: unknown): string {
  const parts: string[] = [];
  if (target === "invoice") {
    const c = invoiceConditionSchema.parse(conditionRaw ?? {});
    parts.push(c.scope === "overdue" ? "Faturas vencidas" : c.scope === "all" ? "Todas as faturas" : "Faturas em aberto");
    if (c.segment.length) parts.push(c.segment.map((s) => SEGMENT_LABELS[s] ?? s).join("/"));
    if (c.status.length) parts.push(c.status.map((s) => STATUS_LABELS[s as never] ?? s).join("/"));
    if (c.aging.length) parts.push(c.aging.map((a) => AGING_LABELS[a as never] ?? a).join("/"));
    if (c.minDaysOverdue > 0) parts.push(`atraso ≥ ${c.minDaysOverdue} dias`);
    if (c.minRisk > 0) parts.push(`risco ≥ ${c.minRisk}`);
    if (c.minOpen > 0) parts.push(`em aberto ≥ R$ ${c.minOpen.toLocaleString("pt-BR")}`);
  } else {
    const c = customerConditionSchema.parse(conditionRaw ?? {});
    parts.push("Clientes");
    if (c.segment.length) parts.push(c.segment.map((s) => SEGMENT_LABELS[s] ?? s).join("/"));
    if (c.minOpenAr > 0) parts.push(`AR aberto ≥ R$ ${c.minOpenAr.toLocaleString("pt-BR")}`);
    if (c.minOverdueAr > 0) parts.push(`AR vencido ≥ R$ ${c.minOverdueAr.toLocaleString("pt-BR")}`);
    if (c.minOverdueCount > 0) parts.push(`${c.minOverdueCount}+ vencidas`);
  }
  return parts.join(" · ");
}

export function describeEffect(effect: Effect): string {
  if (effect.kind === "report_email") return `Enviar relatório "${PRESET_LABELS[effect.reportConfig.preset]}" por email`;
  if (effect.kind === "status") return `Mudar status → ${STATUS_LABELS[effect.to as never] ?? effect.to}`;
  if (effect.kind === "followup") return `Agendar follow-up (${effect.channel})`;
  return "Escrever nota";
}

export function describeAutomation(spec: { target: Target; condition: unknown; effect: Effect; schedule: Schedule }): string {
  const cause = spec.effect.kind === "report_email" ? "Carteira" : describeCondition(spec.target, spec.condition);
  return `${cause} → ${describeEffect(spec.effect)} · ${FREQ_LABELS[spec.schedule.frequency]}`;
}

export { EFFECT_LABELS, FREQ_LABELS };
