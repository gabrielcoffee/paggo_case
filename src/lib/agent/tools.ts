import { prisma } from "@/lib/prisma";
import { appToday } from "@/lib/risk";
import { daysOverdue } from "@/lib/aging";
import { fetchInvoiceDetail } from "@/lib/actions/invoice-detail";
import { fetchDashboard } from "@/lib/queries/dashboard";
import { planStepsSchema, describeStep } from "@/lib/agent/plan-steps";
import type { Prisma } from "@/generated/prisma/client";

export type ChartPayload = { type: string; data: unknown };
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
        return { content: await searchInvoices(input) };
      case "getInvoice":
        return { content: await getInvoice(String(input.id ?? "")) };
      case "getTopRisk":
        return { content: await getTopRisk(input) };
      case "getPortfolioStats":
        return { content: await getPortfolioStats() };
      case "showChart":
        return await showChart(input);
      case "proposeActions":
        return await proposeActions(input, sessionId);
      default:
        return { content: `Ferramenta desconhecida: ${name}`, isError: true };
    }
  } catch (e) {
    return { content: `Erro ao executar ${name}: ${(e as Error).message}`, isError: true };
  }
}

// --- read impls -----------------------------------------------------------

async function searchInvoices(input: Record<string, unknown>): Promise<string> {
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

  return JSON.stringify({ total: mapped.length, faturas: mapped });
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

async function getTopRisk(input: Record<string, unknown>): Promise<string> {
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
  return JSON.stringify(
    rows.map((r) => ({
      id: r.id, cliente: r.customer.name, seg: r.customer.segment,
      open: Number(r.amount) - Number(r.amountPaid), risco: r.riskScore, status: r.status,
    })),
  );
}

async function getPortfolioStats(): Promise<string> {
  const d = await fetchDashboard();
  return JSON.stringify({
    arTotal: d.ar.total, arVencido: d.ar.overdue,
    dsoRealizado: d.dso.realized, dsoAtual: d.dso.current,
    tiers: d.tiers, status: d.statusCounts,
  });
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
