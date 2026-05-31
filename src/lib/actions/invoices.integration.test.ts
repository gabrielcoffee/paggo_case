import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";

// revalidatePath throws outside a Next request context; the actions only use it
// for cache invalidation, irrelevant to the DB behavior under test.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import {
  updateInvoiceStatus,
  addNote,
  scheduleFollowUp,
  createPaymentAgreement,
} from "@/lib/actions/invoices";

const CUST = "TEST-CUST-1";
const INV = "TEST-INV-1";

async function cleanup() {
  await prisma.agreementInstallment.deleteMany({
    where: { agreement: { originalInvoiceId: INV } },
  });
  await prisma.paymentAgreement.deleteMany({ where: { originalInvoiceId: INV } });
  await prisma.note.deleteMany({ where: { entityType: "invoice", entityId: INV } });
  await prisma.followUp.deleteMany({ where: { entityType: "invoice", entityId: INV } });
  await prisma.auditEvent.deleteMany({ where: { entityType: "invoice", entityId: INV } });
  await prisma.invoice.deleteMany({ where: { id: INV } });
  await prisma.customer.deleteMany({ where: { id: CUST } });
}

async function seedInvoice(status = "open") {
  await prisma.customer.create({
    data: { id: CUST, name: "Test Co", segment: "MID", creditLimit: 100000 },
  });
  await prisma.invoice.create({
    data: {
      id: INV,
      customerId: CUST,
      issueDate: new Date("2026-02-01"),
      dueDate: new Date("2026-03-01"),
      amount: 10000,
      amountPaid: 0,
      paymentMethod: "BOLETO",
      attempts: 1,
      previousLateInvoicesSnapshot: 0,
      openBalanceSnapshot: 0,
      status: status as never,
      paymentStatus: "unpaid",
      riskScore: 50,
      riskFactors: [],
    },
  });
}

async function auditFor(action: string) {
  return prisma.auditEvent.findMany({
    where: { entityType: "invoice", entityId: INV, action },
  });
}

beforeEach(async () => {
  await cleanup();
  await seedInvoice();
});

afterEach(cleanup);
afterAll(async () => {
  await prisma.$disconnect();
});

describe("updateInvoiceStatus", () => {
  it("applies a valid transition and writes one audit event", async () => {
    const r = await updateInvoiceStatus({ invoiceId: INV, to: "in_negotiation" });
    expect(r).toEqual({ ok: true });

    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: INV } });
    expect(inv.status).toBe("in_negotiation");

    const audit = await auditFor("status_change");
    expect(audit).toHaveLength(1);
    expect((audit[0].payload as { from: string; to: string }).to).toBe("in_negotiation");
  });

  it("rejects an invalid transition and writes nothing", async () => {
    const r = await updateInvoiceStatus({ invoiceId: INV, to: "agreement_signed" });
    expect(r.ok).toBe(false);

    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: INV } });
    expect(inv.status).toBe("open");
    expect(await auditFor("status_change")).toHaveLength(0);
  });

  it("marking paid settles the balance and recomputes risk to 0", async () => {
    const r = await updateInvoiceStatus({ invoiceId: INV, to: "paid" });
    expect(r).toEqual({ ok: true });

    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: INV } });
    expect(inv.paymentStatus).toBe("paid");
    expect(Number(inv.amountPaid)).toBe(Number(inv.amount));
    expect(inv.paidDate).not.toBeNull();
    expect(inv.riskScore).toBe(0);
  });

  it("optionally attaches a note to the status change", async () => {
    await updateInvoiceStatus({ invoiceId: INV, to: "in_negotiation", note: "ligou, vai pagar" });
    const notes = await prisma.note.findMany({ where: { entityId: INV } });
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toBe("ligou, vai pagar");
  });
});

describe("addNote", () => {
  it("creates a note and an audit event", async () => {
    const r = await addNote({ entityType: "invoice", entityId: INV, body: "nota teste" });
    expect(r).toEqual({ ok: true });
    expect(await prisma.note.count({ where: { entityId: INV } })).toBe(1);
    expect(await auditFor("note_added")).toHaveLength(1);
  });

  it("rejects an empty note", async () => {
    const r = await addNote({ entityType: "invoice", entityId: INV, body: "   " });
    expect(r.ok).toBe(false);
    expect(await prisma.note.count({ where: { entityId: INV } })).toBe(0);
  });
});

describe("scheduleFollowUp", () => {
  it("creates a pending follow-up and an audit event", async () => {
    const r = await scheduleFollowUp({
      entityType: "invoice",
      entityId: INV,
      dueAt: "2026-04-05T13:00:00.000Z",
      channel: "phone",
      body: "cobrar por telefone",
    });
    expect(r).toEqual({ ok: true });

    const fu = await prisma.followUp.findMany({ where: { entityId: INV } });
    expect(fu).toHaveLength(1);
    expect(fu[0].status).toBe("pending");
    expect(fu[0].channel).toBe("phone");
    expect(await auditFor("followup_scheduled")).toHaveLength(1);
  });
});

describe("createPaymentAgreement", () => {
  it("is blocked from an open invoice (must negotiate first)", async () => {
    const r = await createPaymentAgreement({
      invoiceId: INV,
      installments: 3,
      firstDueDate: "2026-05-01",
    });
    expect(r.ok).toBe(false);
    expect(await prisma.paymentAgreement.count({ where: { originalInvoiceId: INV } })).toBe(0);
  });

  it("creates installments summing to the open balance and signs the agreement", async () => {
    await prisma.invoice.update({ where: { id: INV }, data: { status: "in_negotiation" } });

    const r = await createPaymentAgreement({
      invoiceId: INV,
      installments: 3,
      firstDueDate: "2026-05-01",
    });
    expect(r).toEqual({ ok: true });

    const ag = await prisma.paymentAgreement.findFirstOrThrow({
      where: { originalInvoiceId: INV },
      include: { installmentRows: true },
    });
    expect(ag.installmentRows).toHaveLength(3);
    const sum = ag.installmentRows.reduce((a, r) => a + Number(r.amount), 0);
    expect(sum).toBeCloseTo(10000, 2);

    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: INV } });
    expect(inv.status).toBe("agreement_signed");
    expect(await auditFor("agreement_created")).toHaveLength(1);
  });
});
