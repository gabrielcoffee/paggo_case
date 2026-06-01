import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { appToday, type RiskFactor } from "@/lib/risk";
import type { InvoiceRow } from "@/lib/queries/invoice-types";
import { InvoiceDetailStandalone } from "@/components/invoice-detail-standalone";
import type { PanelTab } from "@/components/invoice-detail-panel";

type SP = Record<string, string | string[] | undefined>;
const TABS = ["overview", "notes", "followups", "agreement", "audit"];

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: { customer: { select: { name: true, segment: true } } },
  });
  if (!inv) notFound();

  const amount = Number(inv.amount);
  const amountPaid = Number(inv.amountPaid);
  const row: InvoiceRow = {
    id: inv.id,
    customerId: inv.customerId,
    customerName: inv.customer.name,
    segment: inv.customer.segment,
    paymentMethod: inv.paymentMethod,
    amount,
    amountPaid,
    open: amount - amountPaid,
    issueDate: inv.issueDate.toISOString(),
    dueDate: inv.dueDate.toISOString(),
    paidDate: inv.paidDate ? inv.paidDate.toISOString() : null,
    status: inv.status,
    paymentStatus: inv.paymentStatus,
    attempts: inv.attempts,
    riskScore: inv.riskScore,
    riskFactors: (inv.riskFactors as unknown as RiskFactor[]) ?? [],
  };

  const tabRaw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const initialTab = (TABS.includes(tabRaw ?? "") ? tabRaw : undefined) as PanelTab | undefined;

  return (
    <InvoiceDetailStandalone row={row} today={appToday().toISOString()} initialTab={initialTab} />
  );
}
