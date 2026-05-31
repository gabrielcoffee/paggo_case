import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { confirmPlan, rejectPlan } from "@/lib/actions/agent-plan";
import type { PlanStep } from "@/lib/agent/plan-steps";
import type { Prisma } from "@/generated/prisma/client";

const CUST = "TEST-CUST-AG";
const INV = "TEST-INV-AG";

async function cleanup() {
  await prisma.agreementInstallment.deleteMany({ where: { agreement: { originalInvoiceId: INV } } });
  await prisma.paymentAgreement.deleteMany({ where: { originalInvoiceId: INV } });
  await prisma.note.deleteMany({ where: { entityId: INV } });
  await prisma.followUp.deleteMany({ where: { entityId: INV } });
  await prisma.auditEvent.deleteMany({ where: { entityId: INV } });
  await prisma.agentPlan.deleteMany({ where: { sessionId: "TEST-SESSION" } });
  await prisma.invoice.deleteMany({ where: { id: INV } });
  await prisma.customer.deleteMany({ where: { id: CUST } });
}

async function seed(status = "open") {
  await prisma.customer.create({ data: { id: CUST, name: "Test AG", segment: "MID", creditLimit: 100000 } });
  await prisma.invoice.create({
    data: {
      id: INV, customerId: CUST, issueDate: new Date("2026-02-01"), dueDate: new Date("2026-03-01"),
      amount: 10000, amountPaid: 0, paymentMethod: "BOLETO", attempts: 1,
      previousLateInvoicesSnapshot: 0, openBalanceSnapshot: 0,
      status: status as never, paymentStatus: "unpaid", riskScore: 50, riskFactors: [],
    },
  });
}

async function makePlan(steps: PlanStep[]) {
  return prisma.agentPlan.create({
    data: { sessionId: "TEST-SESSION", summary: "test", steps: steps as unknown as Prisma.InputJsonValue, status: "pending" },
  });
}

beforeEach(async () => {
  await cleanup();
  await seed();
});
afterEach(cleanup);
afterAll(async () => {
  await prisma.$disconnect();
});

describe("confirmPlan", () => {
  it("executes every step and writes agent-attributed audit events", async () => {
    const plan = await makePlan([
      { kind: "note", invoiceId: INV, body: "contato feito" },
      { kind: "status", invoiceId: INV, to: "in_negotiation" },
    ]);
    const r = await confirmPlan(plan.id);
    expect(r).toEqual({ ok: true });

    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: INV } });
    expect(inv.status).toBe("in_negotiation");
    expect(await prisma.note.count({ where: { entityId: INV } })).toBe(1);

    const audit = await prisma.auditEvent.findMany({ where: { entityId: INV } });
    expect(audit.length).toBe(2);
    expect(audit.every((a) => a.origin === "agent")).toBe(true);
    expect(audit.every((a) => (a.payload as { planId?: string }).planId === plan.id)).toBe(true);

    const after = await prisma.agentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after.status).toBe("executed");
    expect(after.executedAt).not.toBeNull();
  });

  it("rolls back the whole plan if any step is invalid", async () => {
    const plan = await makePlan([
      { kind: "note", invoiceId: INV, body: "nota antes do passo inválido" },
      { kind: "status", invoiceId: INV, to: "agreement_signed" }, // invalid from open
    ]);
    const r = await confirmPlan(plan.id);
    expect(r.ok).toBe(false);

    // Nothing committed — the note from step 1 was rolled back.
    expect(await prisma.note.count({ where: { entityId: INV } })).toBe(0);
    expect(await prisma.auditEvent.count({ where: { entityId: INV } })).toBe(0);
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: INV } });
    expect(inv.status).toBe("open");

    const after = await prisma.agentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after.status).toBe("failed");
  });

  it("runs only the kept steps when keptIndexes is given", async () => {
    const plan = await makePlan([
      { kind: "note", invoiceId: INV, body: "deve ser descartada" },
      { kind: "status", invoiceId: INV, to: "in_negotiation" },
    ]);
    const r = await confirmPlan(plan.id, [1]); // keep only the status step
    expect(r).toEqual({ ok: true });

    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: INV } });
    expect(inv.status).toBe("in_negotiation");
    expect(await prisma.note.count({ where: { entityId: INV } })).toBe(0); // dropped step didn't run
    expect(await prisma.auditEvent.count({ where: { entityId: INV } })).toBe(1);
  });

  it("rejects when no steps are kept", async () => {
    const plan = await makePlan([{ kind: "note", invoiceId: INV, body: "x" }]);
    const r = await confirmPlan(plan.id, []);
    expect(r.ok).toBe(false);
    expect(await prisma.note.count({ where: { entityId: INV } })).toBe(0);
  });

  it("refuses to run a non-pending plan twice", async () => {
    const plan = await makePlan([{ kind: "note", invoiceId: INV, body: "x" }]);
    await confirmPlan(plan.id);
    const second = await confirmPlan(plan.id);
    expect(second.ok).toBe(false);
  });
});

describe("rejectPlan", () => {
  it("marks the plan rejected without mutating anything", async () => {
    const plan = await makePlan([{ kind: "status", invoiceId: INV, to: "in_negotiation" }]);
    const r = await rejectPlan(plan.id);
    expect(r).toEqual({ ok: true });
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: INV } });
    expect(inv.status).toBe("open");
    const after = await prisma.agentPlan.findUniqueOrThrow({ where: { id: plan.id } });
    expect(after.status).toBe("rejected");
  });
});
