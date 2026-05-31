import type { Prisma } from "@/generated/prisma/client";
import type { Customer, Invoice } from "@/generated/prisma/client";
import { computeRisk, appToday, type RiskInput } from "@/lib/risk";

// Maps DB rows to the pure scoring input. Decimals → numbers.
export function buildRiskInput(invoice: Invoice, customer: Customer): RiskInput {
  return {
    amount: Number(invoice.amount),
    amountPaid: Number(invoice.amountPaid),
    dueDate: invoice.dueDate,
    segment: customer.segment as RiskInput["segment"],
    paymentMethod: invoice.paymentMethod as RiskInput["paymentMethod"],
    attempts: invoice.attempts,
    previousLateInvoicesSnapshot: invoice.previousLateInvoicesSnapshot,
    openBalanceSnapshot: Number(invoice.openBalanceSnapshot),
    creditLimit: Number(customer.creditLimit),
  };
}

// Recomputes and persists the risk score + factors for one invoice, inside the
// caller's transaction. Call after any write that changes a scoring input
// (e.g. marking paid sets amountPaid = amount → recoverable 0 → score 0).
export async function recomputeInvoiceRisk(
  tx: Prisma.TransactionClient,
  invoiceId: string,
): Promise<void> {
  const inv = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { customer: true },
  });
  const { score, factors } = computeRisk(buildRiskInput(inv, inv.customer), appToday());
  await tx.invoice.update({
    where: { id: invoiceId },
    data: { riskScore: score, riskFactors: factors as unknown as Prisma.InputJsonValue },
  });
}
