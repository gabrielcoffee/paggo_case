import { z } from "zod";
import { automationSpecSchema, describeAutomation } from "@/lib/automation/automation-spec";

// Typed steps the agent proposes and the analyst confirms. Prisma-free so it can
// be shared by the tool layer, the confirm executor, the UI, and tests.

export const planStepSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("status"),
    invoiceId: z.string().min(1),
    to: z.enum(["open", "in_negotiation", "agreement_signed", "paid", "disputed"]),
    note: z.string().trim().max(2000).optional(),
  }),
  z.object({
    kind: z.literal("note"),
    invoiceId: z.string().min(1),
    body: z.string().trim().min(1).max(2000),
  }),
  z.object({
    kind: z.literal("followup"),
    invoiceId: z.string().min(1),
    dueAt: z.string().min(1),
    channel: z.enum(["phone", "email", "whatsapp"]),
    body: z.string().trim().min(1).max(2000),
  }),
  z.object({
    kind: z.literal("writeoff"),
    invoiceId: z.string().min(1),
    note: z.string().trim().max(2000).optional(),
  }),
  z.object({
    kind: z.literal("agreement"),
    invoiceId: z.string().min(1),
    installments: z.number().int().min(1).max(36),
    discountPct: z.number().min(0).max(100).optional(),
    feePct: z.number().min(0).max(100).optional(),
    firstDueDate: z.string().min(1),
    intervalDays: z.number().int().min(1).max(180).optional(),
  }),
  z.object({
    kind: z.literal("automation"),
    spec: automationSpecSchema,
  }),
  z.object({ kind: z.literal("delete_note"), noteId: z.string().min(1) }),
  z.object({ kind: z.literal("delete_followup"), followUpId: z.string().min(1) }),
  z.object({ kind: z.literal("delete_agreement"), agreementId: z.string().min(1) }),
]);

export type PlanStep = z.infer<typeof planStepSchema>;

export const planStepsSchema = z.array(planStepSchema).min(1).max(200);

// One-line human summary of a step (used in the plan card and the model's recap).
export function describeStep(s: PlanStep): string {
  switch (s.kind) {
    case "status":
      return `${s.invoiceId}: status → ${s.to}${s.note ? " (+ nota)" : ""}`;
    case "note":
      return `${s.invoiceId}: nota "${s.body.slice(0, 60)}"`;
    case "followup":
      return `${s.invoiceId}: follow-up ${s.channel} em ${s.dueAt}`;
    case "writeoff":
      return `${s.invoiceId}: baixar (write-off)`;
    case "agreement":
      return `${s.invoiceId}: acordo ${s.installments}x${s.discountPct ? ` -${s.discountPct}%` : ""}`;
    case "automation":
      return `Automação "${s.spec.name}": ${describeAutomation(s.spec)}`;
    case "delete_note":
      return `Excluir nota ${s.noteId}`;
    case "delete_followup":
      return `Excluir follow-up ${s.followUpId}`;
    case "delete_agreement":
      return `Excluir acordo ${s.agreementId}`;
  }
}
