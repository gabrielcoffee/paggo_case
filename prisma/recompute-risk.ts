// Recomputes riskScore + riskFactors for every invoice in place, without touching
// any other table. Use this instead of `db:seed` when notes/audit/agreements exist
// (a re-seed would wipe them). Run: `npx tsx prisma/recompute-risk.ts`
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { computeRisk, appToday, type RiskInput } from "../src/lib/risk";

// Use the session pooler (DIRECT_URL) — better for many sequential writes than the
// transaction pooler.
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL } },
});

async function main() {
  const today = appToday();
  const invoices = await prisma.invoice.findMany({ include: { customer: true } });
  console.log(`Recomputing risk for ${invoices.length} invoices...`);

  let changed = 0;
  const CONCURRENCY = 20;
  for (let i = 0; i < invoices.length; i += CONCURRENCY) {
    const batch = invoices.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (inv) => {
        const input: RiskInput = {
          amount: Number(inv.amount),
          amountPaid: Number(inv.amountPaid),
          dueDate: inv.dueDate,
          segment: inv.customer.segment as RiskInput["segment"],
          paymentMethod: inv.paymentMethod as RiskInput["paymentMethod"],
          attempts: inv.attempts,
          previousLateInvoicesSnapshot: inv.previousLateInvoicesSnapshot,
          openBalanceSnapshot: Number(inv.openBalanceSnapshot),
          creditLimit: Number(inv.customer.creditLimit),
        };
        const { score, factors } = computeRisk(input, today);
        if (score !== inv.riskScore) changed++;
        await prisma.invoice.update({
          where: { id: inv.id },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: { riskScore: score, riskFactors: factors as any },
        });
      }),
    );
    process.stdout.write(`\r  ${Math.min(i + CONCURRENCY, invoices.length)}/${invoices.length}`);
  }
  console.log(`\nDone. ${changed} scores changed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
