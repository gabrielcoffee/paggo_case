import { subDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { appToday } from "@/lib/risk";
import type { Prisma } from "@/generated/prisma/client";
import type { AgingBucket } from "@/lib/aging";
import {
  PAGE_SIZE,
  DATASET_CAP,
  type SortField,
  type SortDir,
  type ScopePreset,
  type InvoiceRow,
} from "@/lib/queries/invoice-types";

export { PAGE_SIZE, DATASET_CAP };
export type { SortField, SortDir, ScopePreset, InvoiceRow };

// Loads the whole working set for a scope in one query. The client then handles
// every filter, sort, search and page entirely in memory (no further requests).
export async function fetchInvoiceDataset(
  scope: ScopePreset,
): Promise<{ rows: InvoiceRow[]; capped: boolean; totalAll: number }> {
  const today = appToday();
  const where: Prisma.InvoiceWhereInput =
    scope === "unpaid"
      ? { paymentStatus: { not: "paid" } }
      : scope === "overdue"
        ? { paymentStatus: { not: "paid" }, dueDate: { lt: today } }
        : {};

  const take = scope === "all" ? DATASET_CAP : undefined;

  const [records, totalAll] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: [{ riskScore: "desc" }, { id: "asc" }],
      take,
      select: {
        id: true,
        customerId: true,
        amount: true,
        amountPaid: true,
        dueDate: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        attempts: true,
        riskScore: true,
        customer: { select: { name: true, segment: true } },
      },
    }),
    prisma.invoice.count({ where }),
  ]);

  const rows: InvoiceRow[] = records.map((r) => {
    const amount = Number(r.amount);
    const amountPaid = Number(r.amountPaid);
    return {
      id: r.id,
      customerId: r.customerId,
      customerName: r.customer.name,
      segment: r.customer.segment,
      paymentMethod: r.paymentMethod,
      amount,
      amountPaid,
      open: amount - amountPaid,
      dueDate: r.dueDate.toISOString(),
      status: r.status,
      paymentStatus: r.paymentStatus,
      attempts: r.attempts,
      riskScore: r.riskScore,
    };
  });

  return { rows, capped: take !== undefined && totalAll > take, totalAll };
}

export type InvoiceQuery = {
  q?: string;
  scope: ScopePreset;
  status: string[];
  segment: string[];
  method: string[];
  aging: AgingBucket[];
  minRisk: number;
  sort: SortField;
  dir: SortDir;
  page: number;
};

const SORTABLE: SortField[] = ["riskScore", "amount", "dueDate", "customer", "updatedAt"];

function csv(v: string | string[] | undefined): string[] {
  if (!v) return [];
  const raw = Array.isArray(v) ? v.join(",") : v;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function parseInvoiceQuery(
  sp: Record<string, string | string[] | undefined>,
): InvoiceQuery {
  const scope = (["unpaid", "overdue", "all"] as const).includes(sp.scope as ScopePreset)
    ? (sp.scope as ScopePreset)
    : "unpaid";
  const sortRaw = (Array.isArray(sp.sort) ? sp.sort[0] : sp.sort) as SortField;
  const sort = SORTABLE.includes(sortRaw) ? sortRaw : "riskScore";
  const dir: SortDir = (Array.isArray(sp.dir) ? sp.dir[0] : sp.dir) === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1);
  const minRisk = Math.max(0, Math.min(100, Number(Array.isArray(sp.minRisk) ? sp.minRisk[0] : sp.minRisk) || 0));

  return {
    q: (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim() || undefined,
    scope,
    status: csv(sp.status),
    segment: csv(sp.segment),
    method: csv(sp.method),
    aging: csv(sp.aging) as AgingBucket[],
    minRisk,
    sort,
    dir,
    page,
  };
}

function agingToDueDateRange(bucket: AgingBucket, today: Date): Prisma.InvoiceWhereInput {
  switch (bucket) {
    case "not_due":
      return { dueDate: { gte: today } };
    case "0-30":
      return { dueDate: { gte: subDays(today, 30), lt: today } };
    case "31-60":
      return { dueDate: { gte: subDays(today, 60), lt: subDays(today, 30) } };
    case "61-90":
      return { dueDate: { gte: subDays(today, 90), lt: subDays(today, 60) } };
    case "90+":
      return { dueDate: { lt: subDays(today, 90) } };
  }
}

export function buildWhere(query: InvoiceQuery): Prisma.InvoiceWhereInput {
  const today = appToday();
  const and: Prisma.InvoiceWhereInput[] = [];

  if (query.scope === "unpaid") and.push({ paymentStatus: { not: "paid" } });
  if (query.scope === "overdue") {
    and.push({ paymentStatus: { not: "paid" } });
    and.push({ dueDate: { lt: today } });
  }

  if (query.status.length) and.push({ status: { in: query.status as never[] } });
  if (query.segment.length)
    and.push({ customer: { segment: { in: query.segment as never[] } } });
  if (query.method.length)
    and.push({ paymentMethod: { in: query.method as never[] } });
  if (query.minRisk > 0) and.push({ riskScore: { gte: query.minRisk } });

  if (query.aging.length) {
    and.push({ OR: query.aging.map((b) => agingToDueDateRange(b, today)) });
  }

  if (query.q) {
    and.push({
      OR: [
        { customer: { name: { contains: query.q, mode: "insensitive" } } },
        { id: { contains: query.q, mode: "insensitive" } },
        { customerId: { contains: query.q, mode: "insensitive" } },
      ],
    });
  }

  return and.length ? { AND: and } : {};
}

function buildOrderBy(query: InvoiceQuery): Prisma.InvoiceOrderByWithRelationInput[] {
  const { sort, dir } = query;
  if (sort === "customer") return [{ customer: { name: dir } }, { riskScore: "desc" }];
  return [{ [sort]: dir } as Prisma.InvoiceOrderByWithRelationInput, { id: "asc" }];
}

export async function fetchInvoices(query: InvoiceQuery) {
  const where = buildWhere(query);
  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: buildOrderBy(query),
      include: { customer: true },
      skip: (query.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.invoice.count({ where }),
  ]);

  return {
    rows,
    total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}
