import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { Prisma } from "../src/generated/prisma/client";
import { buildSchedule } from "../src/lib/agreement";
import { addDays } from "date-fns";

// One-off generator for demo data the CSV import doesn't produce: a handful of
// follow-ups (both invoice- and customer-scoped) and payment agreements. Marked
// with actor/createdBy "seed-test" so re-running wipes the previous batch first
// (idempotent) without touching real analyst/agent data.

const prisma = new PrismaClient();
const TAG = "seed-test";

const APP_TODAY = process.env.APP_TODAY ?? "2026-04-01";
const today = new Date(APP_TODAY);

async function wipePrevious() {
  // Agreements: drop installments + the agreements + their audit trail.
  const prevAgs = await prisma.paymentAgreement.findMany({
    where: { createdBy: TAG },
    select: { id: true, originalInvoiceId: true },
  });
  if (prevAgs.length) {
    const agIds = prevAgs.map((a) => a.id);
    await prisma.agreementInstallment.deleteMany({ where: { agreementId: { in: agIds } } });
    await prisma.paymentAgreement.deleteMany({ where: { id: { in: agIds } } });
  }
  await prisma.followUp.deleteMany({ where: { createdBy: TAG } });
  await prisma.auditEvent.deleteMany({ where: { actor: TAG } });
  console.log(`Wiped ${prevAgs.length} prior agreements + tagged follow-ups/audit.`);
}

async function seedFollowUps() {
  // 3 invoice-scoped on overdue, unpaid invoices.
  const invoices = await prisma.invoice.findMany({
    where: { paymentStatus: { not: "paid" }, dueDate: { lt: today } },
    orderBy: { riskScore: "desc" },
    take: 3,
    select: { id: true },
  });
  // 2 customer-scoped on customers with overdue exposure.
  const customers = await prisma.customer.findMany({
    where: { invoices: { some: { paymentStatus: { not: "paid" }, dueDate: { lt: today } } } },
    orderBy: { id: "asc" },
    take: 2,
    select: { id: true },
  });

  type Plan = {
    entityType: string;
    entityId: string | undefined;
    offsetDays: number;
    channel: "phone" | "email" | "whatsapp";
    body: string;
  };
  const allPlans: Plan[] = [
    { entityType: "invoice", entityId: invoices[0]?.id, offsetDays: 1, channel: "phone", body: "Ligar para confirmar a promessa de pagamento desta fatura." },
    { entityType: "invoice", entityId: invoices[1]?.id, offsetDays: 3, channel: "email", body: "Reenviar segunda via e cobrar retorno por e-mail." },
    { entityType: "invoice", entityId: invoices[2]?.id, offsetDays: -2, channel: "whatsapp", body: "WhatsApp: cliente havia prometido pagar; cobrar status (vencido)." },
    { entityType: "customer", entityId: customers[0]?.id, offsetDays: 7, channel: "phone", body: "Revisar limite de crédito do cliente após histórico de atrasos." },
    { entityType: "customer", entityId: customers[1]?.id, offsetDays: 14, channel: "email", body: "Alinhar plano de regularização global da carteira do cliente." },
  ];
  const plans = allPlans.filter((p) => p.entityId);

  for (const p of plans) {
    const due = addDays(today, p.offsetDays);
    const status = p.offsetDays < 0 ? "missed" : "pending";
    await prisma.$transaction(async (tx) => {
      const fu = await tx.followUp.create({
        data: {
          entityType: p.entityType,
          entityId: p.entityId!,
          dueAt: due,
          channel: p.channel,
          status,
          body: p.body,
          createdBy: TAG,
        },
      });
      await tx.auditEvent.create({
        data: {
          entityType: p.entityType,
          entityId: p.entityId!,
          action: "followup_scheduled",
          origin: "analyst",
          actor: TAG,
          payload: { followUpId: fu.id, channel: p.channel, dueAt: due.toISOString() },
        },
      });
    });
  }
  console.log(`Created ${plans.length} follow-ups.`);
}

async function seedAgreements() {
  // 5 distinct overdue, unpaid invoices with an open balance and a status that
  // can move to agreement_signed.
  const candidates = await prisma.invoice.findMany({
    where: {
      paymentStatus: { not: "paid" },
      dueDate: { lt: today },
      status: { in: ["open", "in_negotiation"] },
    },
    orderBy: { riskScore: "desc" },
    take: 40,
    select: { id: true, amount: true, amountPaid: true },
  });

  const params = [
    { installments: 3, discountPct: 5, feePct: 0 },
    { installments: 6, discountPct: 10, feePct: 0 },
    { installments: 4, discountPct: 0, feePct: 2 },
    { installments: 12, discountPct: 0, feePct: 0 },
    { installments: 2, discountPct: 15, feePct: 0 },
  ];

  let made = 0;
  const seenCustomers = new Set<string>();
  for (const inv of candidates) {
    if (made >= params.length) break;
    const baseCents = Math.round((Number(inv.amount) - Number(inv.amountPaid)) * 100);
    if (baseCents <= 0) continue;
    // Avoid two agreements on the same invoice in one pass.
    const exists = await prisma.paymentAgreement.findFirst({ where: { originalInvoiceId: inv.id } });
    if (exists) continue;

    const p = params[made];
    const firstDue = addDays(today, 15).toISOString();
    const schedule = buildSchedule({
      baseCents,
      installments: p.installments,
      discountPct: p.discountPct,
      feePct: p.feePct,
      firstDueDate: firstDue,
    });

    await prisma.$transaction(async (tx) => {
      const ag = await tx.paymentAgreement.create({
        data: {
          originalInvoiceId: inv.id,
          installments: p.installments,
          discountPct: p.discountPct ? new Prisma.Decimal(p.discountPct) : null,
          feePct: p.feePct ? new Prisma.Decimal(p.feePct) : null,
          createdBy: TAG,
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
      await tx.invoice.update({ where: { id: inv.id }, data: { status: "agreement_signed" } });
      await tx.auditEvent.create({
        data: {
          entityType: "invoice",
          entityId: inv.id,
          action: "agreement_created",
          origin: "analyst",
          actor: TAG,
          payload: {
            agreementId: ag.id,
            installments: p.installments,
            totalCents: schedule.totalCents,
            discountPct: p.discountPct || null,
            feePct: p.feePct || null,
          },
        },
      });
    });
    seenCustomers.add(inv.id);
    made++;
  }
  console.log(`Created ${made} agreements.`);
}

async function main() {
  await wipePrevious();
  await seedFollowUps();
  await seedAgreements();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
