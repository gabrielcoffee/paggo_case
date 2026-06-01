import { prisma } from "@/lib/prisma";
import { appToday } from "@/lib/risk";
import { PAGE_SIZE, type CustomerRow } from "@/lib/queries/customer-types";

export { PAGE_SIZE };
export type { CustomerRow };

type RawRow = {
  id: string;
  name: string;
  segment: string;
  credit_limit: number;
  open_ar: number;
  overdue_ar: number;
  invoice_count: number;
  overdue_count: number;
  max_risk: number;
};

// One grouped query computes every customer aggregate (no N+1). Overdue is relative
// to APP_TODAY. The client then filters/sorts/pages entirely in memory.
export async function fetchCustomerDataset(): Promise<{
  rows: CustomerRow[];
  totalAll: number;
}> {
  const today = appToday();
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT
      c.id,
      c.name,
      c.segment::text AS segment,
      c."creditLimit"::float8 AS credit_limit,
      COALESCE(SUM(i.amount - i."amountPaid") FILTER (WHERE i."paymentStatus" <> 'paid'), 0)::float8 AS open_ar,
      COALESCE(SUM(i.amount - i."amountPaid") FILTER (WHERE i."paymentStatus" <> 'paid' AND i."dueDate" < ${today}), 0)::float8 AS overdue_ar,
      COUNT(i.id)::int AS invoice_count,
      COUNT(i.id) FILTER (WHERE i."paymentStatus" <> 'paid' AND i."dueDate" < ${today})::int AS overdue_count,
      COALESCE(MAX(i."riskScore") FILTER (WHERE i."paymentStatus" <> 'paid'), 0)::int AS max_risk
    FROM "Customer" c
    LEFT JOIN "Invoice" i ON i."customerId" = c.id
    GROUP BY c.id, c.name, c.segment, c."creditLimit"
    ORDER BY overdue_ar DESC, open_ar DESC, c.id ASC`;

  const mapped: CustomerRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    segment: r.segment,
    creditLimit: Number(r.credit_limit),
    openAr: Number(r.open_ar),
    overdueAr: Number(r.overdue_ar),
    invoiceCount: Number(r.invoice_count),
    overdueCount: Number(r.overdue_count),
    maxRisk: Number(r.max_risk),
  }));

  return { rows: mapped, totalAll: mapped.length };
}
