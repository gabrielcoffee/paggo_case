import { prisma } from "@/lib/prisma";
import { buildWhere, type InvoiceQuery } from "@/lib/queries/invoices";
import { appToday } from "@/lib/risk";
import { daysOverdue, AGING_LABELS, type AgingBucket } from "@/lib/aging";
import { SEGMENT_LABELS, STATUS_LABELS } from "@/lib/invoice-status";
import type { InvoiceStatus } from "@/generated/prisma/enums";
import {
  PRESET_LABELS,
  type ReportConfig,
  type ReportData,
  type ReportRow,
} from "@/lib/report/report-config";

// Server-side report builder. Reuses the invoice filter engine (buildWhere) so a
// report respects the same scope/segment/status/aging/risk conditions as the
// list. Used by the dialog action and the automation "report_email" effect.

function toQuery(c: ReportConfig): InvoiceQuery {
  return {
    scope: c.filters.scope,
    status: c.filters.status,
    segment: c.filters.segment,
    method: [],
    aging: c.filters.aging as AgingBucket[],
    minRisk: c.filters.minRisk,
    sort: "riskScore",
    dir: "desc",
    page: 1,
  };
}

function compareRows(sort: ReportConfig["sort"]) {
  return (a: ReportRow, b: ReportRow) => {
    if (sort === "valor_aberto") return b.open - a.open;
    if (sort === "vencimento") return a.dueDate.localeCompare(b.dueDate);
    return b.riskScore - a.riskScore || b.open - a.open;
  };
}

function summarize(c: ReportConfig): string {
  const parts: string[] = [];
  const scopeLabel = { unpaid: "Em aberto", overdue: "Vencidas", all: "Todas" }[c.filters.scope];
  parts.push(scopeLabel);
  if (c.filters.segment.length)
    parts.push(c.filters.segment.map((s) => SEGMENT_LABELS[s] ?? s).join("/"));
  if (c.filters.status.length)
    parts.push(c.filters.status.map((s) => STATUS_LABELS[s as InvoiceStatus] ?? s).join("/"));
  if (c.filters.aging.length)
    parts.push(c.filters.aging.map((a) => AGING_LABELS[a as AgingBucket] ?? a).join("/"));
  if (c.filters.minRisk > 0) parts.push(`risco ≥ ${c.filters.minRisk}`);
  return parts.join(" · ");
}

export async function fetchReportRows(config: ReportConfig): Promise<ReportData> {
  const today = appToday();
  const where = buildWhere(toQuery(config));

  // For risk/due sorts the DB order matches; for valor_aberto (a derived field)
  // we pull a buffer ordered by amount and refine in memory.
  const orderBy =
    config.sort === "valor_aberto"
      ? ([{ amount: "desc" }, { id: "asc" }] as const)
      : config.sort === "vencimento"
        ? ([{ dueDate: "asc" }, { id: "asc" }] as const)
        : ([{ riskScore: "desc" }, { id: "asc" }] as const);

  const records = await prisma.invoice.findMany({
    where,
    orderBy: [...orderBy],
    take: config.sort === "valor_aberto" ? 300 : config.count,
    include: { customer: { select: { name: true, segment: true } } },
  });

  const rows: ReportRow[] = records.map((r) => {
    const amount = Number(r.amount);
    return {
      id: r.id,
      customerName: r.customer.name,
      segment: r.customer.segment,
      paymentMethod: r.paymentMethod,
      amount,
      open: amount - Number(r.amountPaid),
      dueDate: r.dueDate.toISOString(),
      daysOverdue: daysOverdue(r.dueDate, today),
      riskScore: r.riskScore,
      status: r.status,
    };
  });

  rows.sort(compareRows(config.sort));
  const sliced = rows.slice(0, config.count);
  const totalEmAberto = sliced.reduce((s, r) => s + r.open, 0);

  return {
    rows: sliced,
    meta: {
      geradoEm: today.toISOString(),
      count: sliced.length,
      totalEmAberto,
      presetLabel: PRESET_LABELS[config.preset],
      filtroResumo: summarize(config),
    },
  };
}
