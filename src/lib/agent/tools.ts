import { prisma } from "@/lib/prisma";
import { appToday } from "@/lib/risk";
import { daysOverdue } from "@/lib/aging";
import {
  addDays,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import { RISK_RULES } from "@/lib/risk-rules";
import { fetchInvoiceDetail } from "@/lib/actions/invoice-detail";
import { fetchDashboard } from "@/lib/queries/dashboard";
import { planStepsSchema, describeStep } from "@/lib/agent/plan-steps";
import { automationSpecSchema, describeAutomation } from "@/lib/automation/automation-spec";
import { Prisma } from "@/generated/prisma/client";

export type ChartPayload = { type: string; data: unknown; tab?: string };
export type ToolOutcome = {
  content: string;
  isError?: boolean;
  planId?: string;
  chart?: ChartPayload;
};

// --- Anthropic tool definitions (hand-written JSON schemas) ---------------

export const TOOL_DEFS = [
  {
    name: "searchInvoices",
    description:
      "Busca faturas por filtros. Retorna até 25 faturas com id, cliente, segmento, valor em aberto, dias de atraso, status e risco.",
    input_schema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Texto: nome do cliente ou ID da fatura" },
        scope: { type: "string", enum: ["unpaid", "overdue", "all"] },
        segment: { type: "array", items: { type: "string", enum: ["SMB", "MID", "ENT"] } },
        status: { type: "array", items: { type: "string" } },
        minRisk: { type: "number", description: "Risco mínimo (0-100)" },
        minPreviousLate: { type: "number", description: "Mínimo de atrasos anteriores do cliente" },
        minOpen: { type: "number", description: "Valor mínimo em aberto (R$)" },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "getInvoice",
    description: "Detalhe completo de uma fatura: campos, composição do risco, notas, follow-ups, acordos e audit.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "getTopRisk",
    description: "As N faturas de maior risco (padrão escopo não-pagas).",
    input_schema: {
      type: "object",
      properties: {
        n: { type: "number" },
        scope: { type: "string", enum: ["unpaid", "overdue", "all"] },
      },
    },
  },
  {
    name: "getPortfolioStats",
    description: "KPIs da carteira: AR total e vencido, DSO, contagem por tier de risco e por status.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "searchCustomers",
    description:
      "Busca clientes (padrão: mais inadimplentes primeiro). Retorna id, nome, segmento, AR em aberto, AR vencido e nº de faturas vencidas. Use para perguntas sobre clientes inadimplentes.",
    input_schema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Nome ou ID do cliente" },
        n: { type: "number", description: "Quantos clientes (padrão 10)" },
      },
    },
  },
  {
    name: "getCustomer",
    description:
      "Perfil de um cliente (por nome ou ID): agregados (AR aberto/vencido, nº faturas/vencidas) + lista das faturas dele.",
    input_schema: {
      type: "object",
      properties: { q: { type: "string", description: "Nome ou ID do cliente" } },
      required: ["q"],
    },
  },
  {
    name: "getCustomerInvoices",
    description: "Faturas de um cliente (por nome ou ID). scope: unpaid|overdue|all.",
    input_schema: {
      type: "object",
      properties: {
        q: { type: "string" },
        scope: { type: "string", enum: ["unpaid", "overdue", "all"] },
      },
      required: ["q"],
    },
  },
  {
    name: "getWorklist",
    description:
      "O que cobrar HOJE: maior risco entre faturas acionáveis (em aberto, não pagas, ainda não em acordo). Use para 'o que priorizo?'.",
    input_schema: { type: "object", properties: { n: { type: "number" } } },
  },
  {
    name: "getDueSoon",
    description: "Faturas que VENCEM nos próximos N dias (ainda não vencidas). Preventivo.",
    input_schema: {
      type: "object",
      properties: { days: { type: "number", description: "Janela em dias (padrão 7)" } },
    },
  },
  {
    name: "getLargestExposures",
    description: "Maiores saldos em aberto (R$) da carteira.",
    input_schema: { type: "object", properties: { n: { type: "number" } } },
  },
  {
    name: "getInstallmentsDue",
    description:
      "Parcelas de acordo que vencem no período (não pagas). period: today|week|month.",
    input_schema: {
      type: "object",
      properties: { period: { type: "string", enum: ["today", "week", "month"] } },
    },
  },
  {
    name: "getBrokenAgreements",
    description: "Acordos com parcela vencida e não paga (acordos em risco / quebrados).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "getExpectedCashflow",
    description:
      "Recebimento projetado das parcelas de acordo no período (não pagas). period: today|week|month.",
    input_schema: {
      type: "object",
      properties: { period: { type: "string", enum: ["today", "week", "month"] } },
    },
  },
  {
    name: "countInvoices",
    description:
      "Apenas a CONTAGEM de faturas para um critério. Use para 'quantas …?'. Filtros: scope, status[], segment[], minRisk, method.",
    input_schema: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["unpaid", "overdue", "all"] },
        status: { type: "array", items: { type: "string" } },
        segment: { type: "array", items: { type: "string", enum: ["SMB", "MID", "ENT"] } },
        minRisk: { type: "number" },
        method: { type: "string", enum: ["BOLETO", "PIX", "CREDIT_CARD", "BANK_TRANSFER"] },
      },
    },
  },
  {
    name: "getRecentActivity",
    description: "Últimos eventos de auditoria (quem fez o quê) no período. period: today|week|month|all.",
    input_schema: {
      type: "object",
      properties: { period: { type: "string", enum: ["today", "week", "month", "all"] } },
    },
  },
  {
    name: "getSegmentBreakdown",
    description: "AR aberto/vencido e nº de faturas por segmento (SMB/MID/ENT).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "getPaymentMethodBreakdown",
    description: "AR aberto e nº de faturas por método de pagamento.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "getRuleImpact",
    description:
      "Quantas faturas não pagas cada regra de risco aciona + pontos médios. Explica o peso das regras na carteira.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "listAgreements",
    description:
      "Lista os acordos de pagamento da carteira (mais recentes primeiro): fatura, cliente, nº de parcelas, total, desconto/juros e data. Use para 'quais acordos temos'.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number", description: "Quantos acordos (padrão 25)" } },
    },
  },
  {
    name: "listFollowUps",
    description:
      "Lista follow-ups por período. period: 'today' | 'week' | 'month' | 'overdue' (vencidos pendentes) | 'all'. Pode filtrar por status (pending/done/...).",
    input_schema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["today", "week", "month", "overdue", "all"] },
        status: { type: "string" },
      },
    },
  },
  {
    name: "listNotes",
    description:
      "Lista notas por período (data de criação). period: 'today' | 'week' | 'month' | 'all'. Retorna autor, texto e a entidade (fatura/cliente).",
    input_schema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["today", "week", "month", "all"] },
        limit: { type: "number" },
      },
    },
  },
  {
    name: "showChart",
    description:
      "Mostra um gráfico na resposta. type: 'aging' (R$ em aberto por faixa), 'ar_trend' (faturado×recebido por mês), 'risk_tiers' (faturas por tier de risco), 'top_risk' (top-N faturas por risco).",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["aging", "ar_trend", "risk_tiers", "top_risk"] },
        n: { type: "number", description: "Para top_risk: quantas faturas (padrão 10)" },
      },
      required: ["type"],
    },
  },
  {
    name: "proposeActions",
    description:
      "Propõe um plano de ações para o analista CONFIRMAR. Use para qualquer ação em lote (>1 fatura), financeira (acordo) ou destrutiva (write-off/baixa). NÃO executa — cria um plano pendente.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Resumo do que o plano faz e por quê" },
        steps: {
          type: "array",
          description:
            "Passos. kind: 'status'{invoiceId,to,note?} | 'note'{invoiceId,body} | 'followup'{invoiceId,dueAt,channel,body} | 'writeoff'{invoiceId,note?} | 'agreement'{invoiceId,installments,discountPct?,feePct?,firstDueDate,intervalDays?}",
          items: { type: "object" },
        },
      },
      required: ["summary", "steps"],
    },
  },
  {
    name: "listAutomations",
    description: "Lista as automações agendadas existentes (nome, estado, frequência, próxima execução).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "proposeAutomation",
    description:
      "Propõe a CRIAÇÃO de uma automação agendada para o analista CONFIRMAR. Use quando o usuário quer automatizar algo recorrente: escrever notas/follow-ups, mudar status, ou enviar relatório por email periodicamente. NÃO cria direto — gera um plano pendente que o analista confirma.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome curto da automação" },
        target: {
          type: "string",
          enum: ["invoice", "customer"],
          description: "Sobre o que age. Use 'invoice' também quando o efeito for report_email.",
        },
        condition: {
          type: "object",
          description:
            "Filtros do gatilho. invoice: {scope:'unpaid'|'overdue'|'all', segment:[], status:[], aging:['0-30'|'31-60'|'61-90'|'90+'], minRisk, minOpen}. customer: {segment:[], minOpenAr, minOverdueAr, minOverdueCount}. Ignorado para report_email.",
        },
        effect: {
          type: "object",
          description:
            "Ação. note:{kind:'note',bodyTemplate} | followup:{kind:'followup',channel:'phone'|'email'|'whatsapp',dueOffsetDays,bodyTemplate} | status:{kind:'status',to:'in_negotiation'|'disputed'|'written_off'} (só invoice) | report_email:{kind:'report_email',reportConfig:{preset:'maior_risco'|'maior_exposicao'|'vencidas_criticas',count:5|10|15}}. Templates aceitam {cliente} {fatura} {valor_aberto} {dias_atraso} {segmento} {risco}.",
        },
        schedule: {
          type: "object",
          description: "{frequency:'daily'|'weekly'|'monthly', startDate:'YYYY-MM-DD', timeOfDay:'HH:mm' (padrão 10:00)}",
        },
      },
      required: ["name", "target", "condition", "effect", "schedule"],
    },
  },
] as const;

// --- dispatch -------------------------------------------------------------

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  sessionId: string,
): Promise<ToolOutcome> {
  try {
    switch (name) {
      case "searchInvoices":
        return await searchInvoices(input);
      case "getInvoice":
        return { content: await getInvoice(String(input.id ?? "")) };
      case "getTopRisk":
        return await getTopRisk(input);
      case "getPortfolioStats":
        return { content: await getPortfolioStats() };
      case "searchCustomers":
        return await searchCustomers(input);
      case "listAgreements":
        return await listAgreements(input);
      case "listFollowUps":
        return await listFollowUps(input);
      case "listNotes":
        return await listNotes(input);
      case "getCustomer":
        return await getCustomer(input);
      case "getCustomerInvoices":
        return await getCustomerInvoices(input);
      case "getWorklist":
        return await getWorklist(input);
      case "getDueSoon":
        return await getDueSoon(input);
      case "getLargestExposures":
        return await getLargestExposures(input);
      case "getInstallmentsDue":
        return { content: await getInstallmentsDue(input) };
      case "getBrokenAgreements":
        return { content: await getBrokenAgreements() };
      case "getExpectedCashflow":
        return { content: await getExpectedCashflow(input) };
      case "countInvoices":
        return { content: await countInvoices(input) };
      case "getRecentActivity":
        return { content: await getRecentActivity(input) };
      case "getSegmentBreakdown":
        return { content: await getSegmentBreakdown() };
      case "getPaymentMethodBreakdown":
        return { content: await getPaymentMethodBreakdown() };
      case "getRuleImpact":
        return { content: await getRuleImpact() };
      case "showChart":
        return await showChart(input);
      case "proposeActions":
        return await proposeActions(input, sessionId);
      case "listAutomations":
        return await listAutomationsTool();
      case "proposeAutomation":
        return await proposeAutomation(input, sessionId);
      default:
        return { content: `Ferramenta desconhecida: ${name}`, isError: true };
    }
  } catch (e) {
    return { content: `Erro ao executar ${name}: ${(e as Error).message}`, isError: true };
  }
}

// --- read impls -----------------------------------------------------------

async function searchInvoices(input: Record<string, unknown>): Promise<ToolOutcome> {
  const today = appToday();
  const and: Prisma.InvoiceWhereInput[] = [];
  const scope = input.scope ?? "unpaid";
  if (scope === "unpaid") and.push({ paymentStatus: { not: "paid" } });
  if (scope === "overdue") {
    and.push({ paymentStatus: { not: "paid" } }, { dueDate: { lt: today } });
  }
  if (Array.isArray(input.segment) && input.segment.length)
    and.push({ customer: { segment: { in: input.segment as never[] } } });
  if (Array.isArray(input.status) && input.status.length)
    and.push({ status: { in: input.status as never[] } });
  if (typeof input.minRisk === "number") and.push({ riskScore: { gte: input.minRisk } });
  if (typeof input.minPreviousLate === "number")
    and.push({ previousLateInvoicesSnapshot: { gte: input.minPreviousLate } });
  if (typeof input.q === "string" && input.q.trim())
    and.push({
      OR: [
        { id: { contains: input.q, mode: "insensitive" } },
        { customer: { name: { contains: input.q, mode: "insensitive" } } },
      ],
    });

  const limit = Math.min(Number(input.limit) || 25, 50);
  const rows = await prisma.invoice.findMany({
    where: and.length ? { AND: and } : {},
    orderBy: [{ riskScore: "desc" }, { id: "asc" }],
    take: 200,
    select: {
      id: true, amount: true, amountPaid: true, dueDate: true, status: true,
      riskScore: true, previousLateInvoicesSnapshot: true,
      customer: { select: { name: true, segment: true } },
    },
  });

  // minOpen filtered in JS (computed field)
  const minOpen = typeof input.minOpen === "number" ? input.minOpen : 0;
  const mapped = rows
    .map((r) => ({
      id: r.id,
      cliente: r.customer.name,
      seg: r.customer.segment,
      open: Number(r.amount) - Number(r.amountPaid),
      atrasoDias: daysOverdue(r.dueDate, today),
      atrasosAnteriores: r.previousLateInvoicesSnapshot,
      status: r.status,
      risco: r.riskScore,
    }))
    .filter((r) => r.open >= minOpen)
    .slice(0, limit);

  return {
    content: JSON.stringify({ total: mapped.length, faturas: mapped }),
    chart: {
      type: "invoice_list",
      data: mapped.map((m) => ({
        id: m.id,
        cliente: m.cliente,
        seg: m.seg,
        open: m.open,
        risco: m.risco,
        status: m.status,
      })),
    },
  };
}

async function getInvoice(id: string): Promise<string> {
  if (!id) return "Erro: id obrigatório.";
  const d = await fetchInvoiceDetail(id);
  if (!d) return `Fatura ${id} não encontrada.`;
  return JSON.stringify({
    id: d.id, cliente: d.customerName, seg: d.segment, status: d.status,
    pagamento: d.paymentStatus, valor: d.amount, emAberto: d.open,
    vencimento: d.dueDate, metodo: d.paymentMethod, tentativas: d.attempts,
    risco: d.riskScore, fatores: d.riskFactors,
    notas: d.notes.length, followUps: d.followUps.length, acordos: d.agreements.length,
  });
}

async function getTopRisk(input: Record<string, unknown>): Promise<ToolOutcome> {
  const n = Math.min(Number(input.n) || 10, 50);
  const today = appToday();
  const scope = input.scope ?? "unpaid";
  const where: Prisma.InvoiceWhereInput =
    scope === "all" ? {} : scope === "overdue"
      ? { paymentStatus: { not: "paid" }, dueDate: { lt: today } }
      : { paymentStatus: { not: "paid" } };
  const rows = await prisma.invoice.findMany({
    where, orderBy: [{ riskScore: "desc" }, { id: "asc" }], take: n,
    select: { id: true, amount: true, amountPaid: true, riskScore: true, status: true, customer: { select: { name: true, segment: true } } },
  });
  const list = rows.map((r) => ({
    id: r.id,
    cliente: r.customer.name,
    seg: r.customer.segment,
    open: Number(r.amount) - Number(r.amountPaid),
    risco: r.riskScore,
    status: r.status,
  }));
  return { content: JSON.stringify(list), chart: { type: "invoice_list", data: list } };
}

async function searchCustomers(input: Record<string, unknown>): Promise<ToolOutcome> {
  const today = appToday();
  const n = Math.min(Number(input.n) || 10, 50);
  const q = typeof input.q === "string" ? input.q.trim() : "";
  const filter = q
    ? Prisma.sql`WHERE c.name ILIKE ${"%" + q + "%"} OR c.id ILIKE ${"%" + q + "%"}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<
    {
      id: string;
      name: string;
      segment: string;
      open_ar: number;
      overdue_ar: number;
      overdue_count: number;
    }[]
  >`
    SELECT c.id, c.name, c.segment::text AS segment,
      COALESCE(SUM(i.amount - i."amountPaid") FILTER (WHERE i."paymentStatus" <> 'paid'), 0)::float8 AS open_ar,
      COALESCE(SUM(i.amount - i."amountPaid") FILTER (WHERE i."paymentStatus" <> 'paid' AND i."dueDate" < ${today}), 0)::float8 AS overdue_ar,
      COUNT(i.id) FILTER (WHERE i."paymentStatus" <> 'paid' AND i."dueDate" < ${today})::int AS overdue_count
    FROM "Customer" c
    LEFT JOIN "Invoice" i ON i."customerId" = c.id
    ${filter}
    GROUP BY c.id, c.name, c.segment
    ORDER BY overdue_ar DESC, open_ar DESC, c.id ASC
    LIMIT ${n}`;
  const list = rows.map((r) => ({
    id: r.id,
    nome: r.name,
    seg: r.segment,
    openAr: Number(r.open_ar),
    overdueAr: Number(r.overdue_ar),
    overdueCount: Number(r.overdue_count),
  }));
  return {
    content: JSON.stringify({ total: list.length, clientes: list }),
    chart: { type: "customer_list", data: list },
  };
}

async function getPortfolioStats(): Promise<string> {
  const d = await fetchDashboard();
  return JSON.stringify({
    arTotal: d.ar.total, arVencido: d.ar.overdue,
    dsoRealizado: d.dso.realized, dsoAtual: d.dso.current,
    tiers: d.tiers, status: d.statusCounts,
  });
}

const INV_SELECT = {
  id: true,
  amount: true,
  amountPaid: true,
  riskScore: true,
  status: true,
  customer: { select: { name: true, segment: true } },
} as const;

type InvRow = {
  id: string;
  amount: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  riskScore: number;
  status: string;
  customer: { name: string; segment: string };
};

function invoiceListItems(rows: InvRow[]) {
  return rows.map((r) => ({
    id: r.id,
    cliente: r.customer.name,
    seg: r.customer.segment,
    open: Number(r.amount) - Number(r.amountPaid),
    risco: r.riskScore,
    status: r.status,
  }));
}

async function resolveCustomer(q: string) {
  const t = q.trim();
  if (!t) return null;
  const byId = await prisma.customer.findUnique({ where: { id: t } });
  if (byId) return byId;
  return prisma.customer.findFirst({
    where: { name: { contains: t, mode: "insensitive" } },
    orderBy: { name: "asc" },
  });
}

async function getCustomer(input: Record<string, unknown>): Promise<ToolOutcome> {
  const c = await resolveCustomer(String(input.q ?? ""));
  if (!c) return { content: "Cliente não encontrado.", isError: true };
  const today = appToday();
  const invs = await prisma.invoice.findMany({
    where: { customerId: c.id },
    orderBy: [{ riskScore: "desc" }, { id: "asc" }],
    select: { ...INV_SELECT, paymentStatus: true, dueDate: true },
  });
  let openAr = 0;
  let overdueAr = 0;
  let overdueCount = 0;
  for (const i of invs) {
    if (i.paymentStatus === "paid") continue;
    const open = Number(i.amount) - Number(i.amountPaid);
    openAr += open;
    if (i.dueDate < today) {
      overdueAr += open;
      overdueCount += 1;
    }
  }
  const list = invoiceListItems(invs);
  return {
    content: JSON.stringify({
      cliente: {
        id: c.id,
        nome: c.name,
        seg: c.segment,
        limite: Number(c.creditLimit),
        arAberto: openAr,
        arVencido: overdueAr,
        faturas: invs.length,
        vencidas: overdueCount,
      },
    }),
    chart: { type: "invoice_list", data: list },
  };
}

async function getCustomerInvoices(input: Record<string, unknown>): Promise<ToolOutcome> {
  const c = await resolveCustomer(String(input.q ?? ""));
  if (!c) return { content: "Cliente não encontrado.", isError: true };
  const today = appToday();
  const scope = input.scope ?? "unpaid";
  const where: Prisma.InvoiceWhereInput = {
    customerId: c.id,
    ...(scope === "unpaid"
      ? { paymentStatus: { not: "paid" } }
      : scope === "overdue"
        ? { paymentStatus: { not: "paid" }, dueDate: { lt: today } }
        : {}),
  };
  const invs = await prisma.invoice.findMany({
    where,
    orderBy: [{ riskScore: "desc" }, { id: "asc" }],
    take: 50,
    select: INV_SELECT,
  });
  const list = invoiceListItems(invs);
  return {
    content: JSON.stringify({ cliente: c.name, total: list.length, faturas: list }),
    chart: { type: "invoice_list", data: list },
  };
}

async function getWorklist(input: Record<string, unknown>): Promise<ToolOutcome> {
  const n = Math.min(Number(input.n) || 15, 50);
  const rows = await prisma.invoice.findMany({
    where: {
      paymentStatus: { not: "paid" },
      status: { in: ["open", "in_negotiation", "disputed"] as never[] },
    },
    orderBy: [{ riskScore: "desc" }, { id: "asc" }],
    take: n,
    select: INV_SELECT,
  });
  const list = invoiceListItems(rows);
  return {
    content: JSON.stringify({ total: list.length, faturas: list }),
    chart: { type: "invoice_list", data: list },
  };
}

async function getDueSoon(input: Record<string, unknown>): Promise<ToolOutcome> {
  const today = appToday();
  const days = Math.min(Number(input.days) || 7, 90);
  const rows = await prisma.invoice.findMany({
    where: {
      paymentStatus: { not: "paid" },
      dueDate: { gte: startOfDay(today), lte: endOfDay(addDays(today, days)) },
    },
    orderBy: [{ dueDate: "asc" }],
    take: 50,
    select: INV_SELECT,
  });
  const list = invoiceListItems(rows);
  return {
    content: JSON.stringify({ dias: days, total: list.length, faturas: list }),
    chart: { type: "invoice_list", data: list },
  };
}

async function getLargestExposures(input: Record<string, unknown>): Promise<ToolOutcome> {
  const n = Math.min(Number(input.n) || 10, 50);
  const rows = await prisma.invoice.findMany({
    where: { paymentStatus: { not: "paid" } },
    orderBy: [{ amount: "desc" }],
    take: 200,
    select: INV_SELECT,
  });
  const sorted = rows
    .map((r) => ({ r, open: Number(r.amount) - Number(r.amountPaid) }))
    .sort((a, b) => b.open - a.open)
    .slice(0, n)
    .map((x) => x.r);
  const list = invoiceListItems(sorted);
  return {
    content: JSON.stringify({ total: list.length, faturas: list }),
    chart: { type: "invoice_list", data: list },
  };
}

async function getInstallmentsDue(input: Record<string, unknown>): Promise<string> {
  const today = appToday();
  const period = String(input.period ?? "week");
  const range =
    periodRange(period, today) ?? {
      gte: startOfWeek(today, { weekStartsOn: 1 }),
      lte: endOfWeek(today, { weekStartsOn: 1 }),
    };
  const rows = await prisma.agreementInstallment.findMany({
    where: { dueDate: { gte: range.gte, lte: range.lte }, status: { not: "paid" } },
    orderBy: { dueDate: "asc" },
    take: 100,
    include: {
      agreement: {
        include: { originalInvoice: { select: { id: true, customer: { select: { name: true } } } } },
      },
    },
  });
  const parcelas = rows.map((r) => ({
    fatura: r.agreement.originalInvoiceId,
    cliente: r.agreement.originalInvoice.customer.name,
    parcela: r.installmentNumber,
    vencimento: r.dueDate.toISOString(),
    valor: Number(r.amount),
    status: r.status,
  }));
  const total = parcelas.reduce((s, p) => s + p.valor, 0);
  return JSON.stringify({ periodo: period, total: parcelas.length, valorTotal: total, parcelas });
}

async function getBrokenAgreements(): Promise<string> {
  const today = appToday();
  const overdue = await prisma.agreementInstallment.findMany({
    where: { dueDate: { lt: startOfDay(today) }, status: { not: "paid" } },
    include: {
      agreement: {
        include: { originalInvoice: { select: { id: true, customer: { select: { name: true } } } } },
      },
    },
  });
  const byAg = new Map<
    string,
    { fatura: string; cliente: string; parcelasVencidas: number; valorVencido: number }
  >();
  for (const i of overdue) {
    const ag = i.agreement;
    const e =
      byAg.get(ag.id) ?? {
        fatura: ag.originalInvoiceId,
        cliente: ag.originalInvoice.customer.name,
        parcelasVencidas: 0,
        valorVencido: 0,
      };
    e.parcelasVencidas += 1;
    e.valorVencido += Number(i.amount);
    byAg.set(ag.id, e);
  }
  const acordos = [...byAg.values()].sort((a, b) => b.valorVencido - a.valorVencido);
  return JSON.stringify({ total: acordos.length, acordos });
}

async function getExpectedCashflow(input: Record<string, unknown>): Promise<string> {
  const today = appToday();
  const period = String(input.period ?? "month");
  const range =
    periodRange(period, today) ?? { gte: startOfMonth(today), lte: endOfMonth(today) };
  const rows = await prisma.agreementInstallment.findMany({
    where: { dueDate: { gte: range.gte, lte: range.lte }, status: { not: "paid" } },
    select: { amount: true },
  });
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  return JSON.stringify({ periodo: period, parcelas: rows.length, recebimentoProjetado: total });
}

async function countInvoices(input: Record<string, unknown>): Promise<string> {
  const today = appToday();
  const and: Prisma.InvoiceWhereInput[] = [];
  if (input.scope === "unpaid") and.push({ paymentStatus: { not: "paid" } });
  if (input.scope === "overdue")
    and.push({ paymentStatus: { not: "paid" } }, { dueDate: { lt: today } });
  if (Array.isArray(input.status) && input.status.length)
    and.push({ status: { in: input.status as never[] } });
  if (Array.isArray(input.segment) && input.segment.length)
    and.push({ customer: { segment: { in: input.segment as never[] } } });
  if (typeof input.minRisk === "number") and.push({ riskScore: { gte: input.minRisk } });
  if (typeof input.method === "string")
    and.push({ paymentMethod: input.method as never });
  const count = await prisma.invoice.count({ where: and.length ? { AND: and } : {} });
  return JSON.stringify({ count });
}

async function getRecentActivity(input: Record<string, unknown>): Promise<string> {
  const today = appToday();
  const period = String(input.period ?? "today");
  const range = periodRange(period, today);
  const where: Prisma.AuditEventWhereInput = range
    ? { timestamp: { gte: range.gte, lte: range.lte } }
    : {};
  const rows = await prisma.auditEvent.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: 50,
  });
  const eventos = rows.map((e) => ({
    acao: e.action,
    origem: e.origin,
    autor: e.actor,
    tipo: e.entityType,
    ref: e.entityId,
    quando: e.timestamp.toISOString(),
  }));
  return JSON.stringify({ periodo: period, total: eventos.length, eventos });
}

async function getSegmentBreakdown(): Promise<string> {
  const today = appToday();
  const rows = await prisma.$queryRaw<
    { segment: string; count: number; open_ar: number; overdue_ar: number }[]
  >`
    SELECT c.segment::text AS segment,
      COUNT(i.id)::int AS count,
      COALESCE(SUM(i.amount - i."amountPaid") FILTER (WHERE i."paymentStatus" <> 'paid'), 0)::float8 AS open_ar,
      COALESCE(SUM(i.amount - i."amountPaid") FILTER (WHERE i."paymentStatus" <> 'paid' AND i."dueDate" < ${today}), 0)::float8 AS overdue_ar
    FROM "Customer" c
    LEFT JOIN "Invoice" i ON i."customerId" = c.id
    GROUP BY c.segment
    ORDER BY overdue_ar DESC`;
  return JSON.stringify({
    segmentos: rows.map((r) => ({
      segmento: r.segment,
      faturas: Number(r.count),
      arAberto: Number(r.open_ar),
      arVencido: Number(r.overdue_ar),
    })),
  });
}

async function getPaymentMethodBreakdown(): Promise<string> {
  const rows = await prisma.$queryRaw<{ method: string; count: number; open_ar: number }[]>`
    SELECT i."paymentMethod"::text AS method,
      COUNT(i.id)::int AS count,
      COALESCE(SUM(i.amount - i."amountPaid") FILTER (WHERE i."paymentStatus" <> 'paid'), 0)::float8 AS open_ar
    FROM "Invoice" i
    GROUP BY i."paymentMethod"
    ORDER BY open_ar DESC`;
  return JSON.stringify({
    metodos: rows.map((r) => ({
      metodo: r.method,
      faturas: Number(r.count),
      arAberto: Number(r.open_ar),
    })),
  });
}

async function getRuleImpact(): Promise<string> {
  const rows = await prisma.invoice.findMany({
    where: { paymentStatus: { not: "paid" } },
    select: { riskFactors: true },
    take: 5000,
  });
  const agg = new Map<string, { count: number; sum: number }>();
  for (const r of rows) {
    const factors = (r.riskFactors as unknown as { rule: string; points: number }[]) ?? [];
    for (const f of factors) {
      const e = agg.get(f.rule) ?? { count: 0, sum: 0 };
      e.count += 1;
      e.sum += f.points;
      agg.set(f.rule, e);
    }
  }
  const regras = RISK_RULES.map((rule) => {
    const e = agg.get(rule.key);
    return {
      regra: rule.label,
      key: rule.key,
      faturasAcionadas: e?.count ?? 0,
      pontosMedios: e && e.count ? Math.round((e.sum / e.count) * 10) / 10 : 0,
    };
  });
  return JSON.stringify({ amostra: rows.length, regras });
}

function periodRange(period: string, today: Date): { gte: Date; lte: Date } | null {
  if (period === "today") return { gte: startOfDay(today), lte: endOfDay(today) };
  if (period === "week")
    return {
      gte: startOfWeek(today, { weekStartsOn: 1 }),
      lte: endOfWeek(today, { weekStartsOn: 1 }),
    };
  if (period === "month") return { gte: startOfMonth(today), lte: endOfMonth(today) };
  return null;
}

async function listAgreements(input: Record<string, unknown>): Promise<ToolOutcome> {
  const limit = Math.min(Number(input.limit) || 25, 50);
  const ags = await prisma.paymentAgreement.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      installmentRows: { select: { amount: true } },
      originalInvoice: {
        select: {
          id: true,
          amount: true,
          amountPaid: true,
          riskScore: true,
          status: true,
          customer: { select: { name: true, segment: true } },
        },
      },
    },
  });
  const acordos = ags.map((a) => ({
    id: a.id,
    fatura: a.originalInvoiceId,
    cliente: a.originalInvoice.customer.name,
    parcelas: a.installments,
    total: a.installmentRows.reduce((s, r) => s + Number(r.amount), 0),
    desconto: a.discountPct != null ? Number(a.discountPct) : null,
    juros: a.feePct != null ? Number(a.feePct) : null,
    criadoEm: a.createdAt.toISOString(),
  }));
  const invoices = ags.map((a) => ({
    id: a.originalInvoice.id,
    cliente: a.originalInvoice.customer.name,
    seg: a.originalInvoice.customer.segment,
    open: Number(a.originalInvoice.amount) - Number(a.originalInvoice.amountPaid),
    risco: a.originalInvoice.riskScore,
    status: a.originalInvoice.status,
  }));
  return {
    content: JSON.stringify({ total: acordos.length, acordos }),
    chart: { type: "invoice_list", data: invoices, tab: "agreement" },
  };
}

async function listFollowUps(input: Record<string, unknown>): Promise<ToolOutcome> {
  const today = appToday();
  const period = String(input.period ?? "all");
  const where: Prisma.FollowUpWhereInput = {};
  if (period === "overdue") {
    where.dueAt = { lt: startOfDay(today) };
    where.status = "pending";
  } else {
    const range = periodRange(period, today);
    if (range) where.dueAt = { gte: range.gte, lte: range.lte };
  }
  if (typeof input.status === "string") where.status = input.status as never;
  const rows = await prisma.followUp.findMany({
    where,
    orderBy: { dueAt: "asc" },
    take: 60,
  });
  const followups = rows.map((f) => ({
    id: f.id,
    tipo: f.entityType,
    ref: f.entityId,
    vencimento: f.dueAt.toISOString(),
    canal: f.channel,
    status: f.status,
    descricao: f.body,
  }));
  return {
    content: JSON.stringify({ total: followups.length, periodo: period, followups }),
    chart: {
      type: "followups_list",
      data: followups.map((f) => ({
        id: f.id,
        entityType: f.tipo,
        entityId: f.ref,
        canal: f.canal,
        vencimento: f.vencimento,
        status: f.status,
        descricao: f.descricao,
      })),
    },
  };
}

async function listNotes(input: Record<string, unknown>): Promise<ToolOutcome> {
  const today = appToday();
  const period = String(input.period ?? "all");
  const range = periodRange(period, today);
  const where: Prisma.NoteWhereInput = {};
  if (range) where.createdAt = { gte: range.gte, lte: range.lte };
  const limit = Math.min(Number(input.limit) || 30, 60);
  const rows = await prisma.note.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const notas = rows.map((n) => ({
    id: n.id,
    tipo: n.entityType,
    ref: n.entityId,
    autor: n.author,
    texto: n.body,
    criadoEm: n.createdAt.toISOString(),
  }));
  return {
    content: JSON.stringify({ total: notas.length, periodo: period, notas }),
    chart: {
      type: "notes_list",
      data: notas.map((n) => ({
        id: n.id,
        entityType: n.tipo,
        entityId: n.ref,
        autor: n.autor,
        texto: n.texto,
        criadoEm: n.criadoEm,
      })),
    },
  };
}

const CHART_LABELS: Record<string, string> = {
  aging: "aging",
  ar_trend: "faturado×recebido",
  risk_tiers: "distribuição de risco",
  top_risk: "top risco",
};

async function showChart(input: Record<string, unknown>): Promise<ToolOutcome> {
  const type = String(input.type ?? "");
  if (!CHART_LABELS[type]) return { content: `Tipo de gráfico inválido: ${type}`, isError: true };

  let data: unknown;
  if (type === "top_risk") {
    const n = Math.min(Number(input.n) || 10, 30);
    const rows = await prisma.invoice.findMany({
      where: { paymentStatus: { not: "paid" } },
      orderBy: [{ riskScore: "desc" }, { id: "asc" }],
      take: n,
      select: { id: true, amount: true, amountPaid: true, riskScore: true, customer: { select: { name: true } } },
    });
    data = rows.map((r) => ({
      label: r.customer.name,
      risco: r.riskScore,
      open: Number(r.amount) - Number(r.amountPaid),
    }));
  } else {
    const d = await fetchDashboard();
    data = type === "aging" ? d.aging : type === "ar_trend" ? d.trend : d.tiers;
  }

  // The model only sees the short ack; the chart payload rides separately to the UI.
  return { content: `Gráfico de ${CHART_LABELS[type]} incluído na resposta.`, chart: { type, data } };
}

// --- proposeActions (human-in-the-loop) -----------------------------------

async function proposeActions(
  input: Record<string, unknown>,
  sessionId: string,
): Promise<ToolOutcome> {
  const parsed = planStepsSchema.safeParse(input.steps);
  if (!parsed.success) {
    return {
      content: `Passos inválidos: ${parsed.error.issues[0]?.message ?? "formato incorreto"}. Revise e tente novamente.`,
      isError: true,
    };
  }
  const summary = String(input.summary ?? "Plano de ações");
  const steps = parsed.data;
  const plan = await prisma.agentPlan.create({
    data: {
      sessionId,
      summary,
      steps: steps as unknown as Prisma.InputJsonValue,
      status: "pending",
    },
  });
  return {
    planId: plan.id,
    content: `Plano ${plan.id} criado com ${steps.length} passo(s), aguardando confirmação do analista:\n${steps
      .map((s) => `- ${describeStep(s)}`)
      .join("\n")}`,
  };
}

async function proposeAutomation(
  input: Record<string, unknown>,
  sessionId: string,
): Promise<ToolOutcome> {
  const parsed = automationSpecSchema.safeParse(input);
  if (!parsed.success) {
    return {
      content: `Spec da automação inválida: ${parsed.error.issues[0]?.message ?? "formato incorreto"}. Revise e tente novamente.`,
      isError: true,
    };
  }
  const spec = parsed.data;
  const plan = await prisma.agentPlan.create({
    data: {
      sessionId,
      summary: `Criar automação: ${spec.name}`,
      steps: [{ kind: "automation", spec }] as unknown as Prisma.InputJsonValue,
      status: "pending",
    },
  });
  return {
    planId: plan.id,
    content: `Plano ${plan.id} criado: automação "${spec.name}" — ${describeAutomation(spec)}. Aguardando confirmação do analista.`,
  };
}

async function listAutomationsTool(): Promise<ToolOutcome> {
  const rules = await prisma.automationRule.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  if (!rules.length) return { content: "Nenhuma automação cadastrada." };
  const lines = rules.map(
    (r) =>
      `- ${r.name} [${r.enabled ? "ativa" : "pausada"}] · ${r.frequency} às ${r.timeOfDay} · próxima ${r.nextRunAt
        .toISOString()
        .slice(0, 16)
        .replace("T", " ")}`,
  );
  return { content: `Automações (${rules.length}):\n${lines.join("\n")}` };
}
