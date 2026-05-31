import { prisma } from "@/lib/prisma";
import { appToday } from "@/lib/risk";
import { agingBucket, AGING_BUCKETS, type AgingBucket } from "@/lib/aging";

export type DashboardData = {
  ar: { total: number; overdue: number };
  dso: { realized: number; current: number };
  tiers: { critical: number; high: number; medium: number; low: number };
  statusCounts: { status: string; count: number }[];
  aging: { bucket: AgingBucket; count: number; open: number }[];
  trend: { month: string; billed: number; received: number }[];
};

function num(v: unknown): number {
  return v == null ? 0 : Number(v);
}

export async function fetchDashboard(): Promise<DashboardData> {
  const today = appToday();

  const [
    arRows,
    overdueRows,
    billedRows,
    dsoRows,
    statusGroups,
    critical,
    high,
    medium,
    low,
    unpaid,
    billedSeries,
    receivedSeries,
  ] = await Promise.all([
    prisma.$queryRaw<{ v: number }[]>`
      SELECT COALESCE(SUM(amount - "amountPaid"), 0) AS v
      FROM "Invoice" WHERE "paymentStatus" != 'paid'`,
    prisma.$queryRaw<{ v: number }[]>`
      SELECT COALESCE(SUM(amount - "amountPaid"), 0) AS v
      FROM "Invoice" WHERE "paymentStatus" != 'paid' AND "dueDate" < ${today}`,
    prisma.$queryRaw<{ v: number }[]>`SELECT COALESCE(SUM(amount), 0) AS v FROM "Invoice"`,
    prisma.$queryRaw<{ v: number }[]>`
      SELECT AVG("paidDate" - "issueDate") AS v
      FROM "Invoice" WHERE "paidDate" IS NOT NULL`,
    prisma.invoice.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.invoice.count({ where: { paymentStatus: { not: "paid" }, riskScore: { gte: 55 } } }),
    prisma.invoice.count({
      where: { paymentStatus: { not: "paid" }, riskScore: { gte: 40, lt: 55 } },
    }),
    prisma.invoice.count({
      where: { paymentStatus: { not: "paid" }, riskScore: { gte: 20, lt: 40 } },
    }),
    prisma.invoice.count({
      where: { paymentStatus: { not: "paid" }, riskScore: { gte: 1, lt: 20 } },
    }),
    prisma.invoice.findMany({
      where: { paymentStatus: { not: "paid" } },
      select: { dueDate: true, amount: true, amountPaid: true },
    }),
    prisma.$queryRaw<{ month: string; v: number }[]>`
      SELECT to_char(date_trunc('month', "issueDate"), 'YYYY-MM') AS month, SUM(amount) AS v
      FROM "Invoice" GROUP BY 1 ORDER BY 1`,
    prisma.$queryRaw<{ month: string; v: number }[]>`
      SELECT to_char(date_trunc('month', "paidDate"), 'YYYY-MM') AS month, SUM("amountPaid") AS v
      FROM "Invoice" WHERE "paidDate" IS NOT NULL GROUP BY 1 ORDER BY 1`,
  ]);

  const arTotal = num(arRows[0]?.v);
  const billed = num(billedRows[0]?.v);

  // Aging: bucket unpaid invoices by their open balance.
  const agingMap = new Map<AgingBucket, { count: number; open: number }>();
  for (const b of AGING_BUCKETS) agingMap.set(b, { count: 0, open: 0 });
  for (const inv of unpaid) {
    const b = agingBucket(inv.dueDate, today);
    const e = agingMap.get(b)!;
    e.count += 1;
    e.open += Number(inv.amount) - Number(inv.amountPaid);
  }

  // Merge billed + received monthly series into one timeline.
  const months = new Map<string, { billed: number; received: number }>();
  for (const r of billedSeries) months.set(r.month, { billed: num(r.v), received: 0 });
  for (const r of receivedSeries) {
    const e = months.get(r.month) ?? { billed: 0, received: 0 };
    e.received = num(r.v);
    months.set(r.month, e);
  }

  return {
    ar: { total: arTotal, overdue: num(overdueRows[0]?.v) },
    dso: {
      realized: Math.round(num(dsoRows[0]?.v)),
      current: billed > 0 ? Math.round((arTotal / billed) * 90) : 0,
    },
    tiers: { critical, high, medium, low },
    statusCounts: statusGroups.map((g) => ({ status: g.status, count: g._count._all })),
    aging: AGING_BUCKETS.map((b) => ({ bucket: b, ...agingMap.get(b)! })),
    trend: [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, billed: v.billed, received: v.received })),
  };
}
