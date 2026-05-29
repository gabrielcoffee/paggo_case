import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "../src/generated/prisma/client";
import { computeRisk } from "../src/lib/risk";
import { parseISO } from "date-fns";

const prisma = new PrismaClient();

async function createInChunks<T>(
  data: T[],
  size: number,
  fn: (chunk: T[]) => Promise<unknown>,
) {
  for (let i = 0; i < data.length; i += size) {
    await fn(data.slice(i, i + size));
    console.log(`  ${Math.min(i + size, data.length)}/${data.length}`);
  }
}

type Row = {
  invoiceId: string;
  customerId: string;
  customerName: string;
  customerSegment: "SMB" | "MID" | "ENT";
  issueDate: string;
  dueDate: string;
  paidDate: string;
  amount: string;
  amountPaid: string;
  paymentMethod: "BOLETO" | "PIX" | "CREDIT_CARD" | "BANK_TRANSFER";
  attempts: string;
  previousLateInvoices: string;
  creditLimit: string;
  openBalance: string;
};

function deriveStatus(paidDate: string, amount: number, amountPaid: number) {
  if (paidDate) return "paid" as const;
  return "open" as const;
}

function derivePaymentStatus(amount: number, amountPaid: number) {
  if (amountPaid >= amount) return "paid" as const;
  if (amountPaid > 0) return "partial" as const;
  return "unpaid" as const;
}

async function main() {
  const today = parseISO(process.env.APP_TODAY ?? "2026-04-01");

  console.log("Reading CSV...");
  const csvPath = resolve(process.cwd(), "data/invoices.csv");
  const file = readFileSync(csvPath, "utf-8");
  const rows: Row[] = parse(file, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  console.log(`Parsed ${rows.length} rows.`);

  // Deduplicate customers (CSV repeats them across invoices).
  const customers = new Map<string, { id: string; name: string; segment: Row["customerSegment"]; creditLimit: number }>();
  for (const r of rows) {
    if (!customers.has(r.customerId)) {
      customers.set(r.customerId, {
        id: r.customerId,
        name: r.customerName,
        segment: r.customerSegment,
        creditLimit: Number(r.creditLimit),
      });
    }
  }
  console.log(`Unique customers: ${customers.size}`);

  // Idempotent full refresh: clear dependents then base tables.
  // Children first to respect FKs.
  console.log("Clearing existing data...");
  await prisma.agreementInstallment.deleteMany();
  await prisma.paymentAgreement.deleteMany();
  await prisma.note.deleteMany();
  await prisma.followUp.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.agentPlan.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.customer.deleteMany();

  // Bulk insert customers in chunks.
  console.log("Inserting customers...");
  const customerData = [...customers.values()];
  await createInChunks(customerData, 1000, (chunk) =>
    prisma.customer.createMany({ data: chunk }),
  );

  // Build invoice rows with derived status, payment status, and risk score.
  console.log("Computing invoices...");
  const invoiceData = rows.map((r) => {
    const amount = Number(r.amount);
    const amountPaid = Number(r.amountPaid);
    const paidDate = r.paidDate ? parseISO(r.paidDate) : null;
    const dueDate = parseISO(r.dueDate);
    const issueDate = parseISO(r.issueDate);

    const risk = computeRisk(
      {
        amount,
        amountPaid,
        dueDate,
        segment: r.customerSegment,
        paymentMethod: r.paymentMethod,
        attempts: Number(r.attempts),
        previousLateInvoicesSnapshot: Number(r.previousLateInvoices),
        openBalanceSnapshot: Number(r.openBalance),
        creditLimit: Number(r.creditLimit),
      },
      today,
    );

    return {
      id: r.invoiceId,
      customerId: r.customerId,
      issueDate,
      dueDate,
      paidDate,
      amount,
      amountPaid,
      paymentMethod: r.paymentMethod,
      attempts: Number(r.attempts),
      previousLateInvoicesSnapshot: Number(r.previousLateInvoices),
      openBalanceSnapshot: Number(r.openBalance),
      status: deriveStatus(r.paidDate, amount, amountPaid),
      paymentStatus: derivePaymentStatus(amount, amountPaid),
      riskScore: risk.score,
      riskFactors: risk.factors,
      updatedAt: today,
    };
  });

  console.log("Inserting invoices...");
  await createInChunks(invoiceData, 1000, (chunk) =>
    prisma.invoice.createMany({ data: chunk }),
  );

  const total = await prisma.invoice.count();
  console.log(`Done. ${total} invoices in DB.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
