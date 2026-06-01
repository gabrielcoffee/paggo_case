import { prisma } from "@/lib/prisma";

// Latest notes / follow-ups / agreements across the whole portfolio, for the
// simplified activity sub-pages. Notes and follow-ups are polymorphic
// (invoice|customer); we resolve a display name with one batched lookup each.

export type ActivityNote = {
  id: string;
  entityType: string;
  entityId: string;
  cliente: string;
  autor: string;
  texto: string;
  criadoEm: string;
};
export type ActivityFollowUp = {
  id: string;
  entityType: string;
  entityId: string;
  cliente: string;
  canal: string;
  vencimento: string;
  status: string;
  descricao: string;
};
export type ActivityAgreement = {
  id: string;
  fatura: string;
  cliente: string;
  parcelas: number;
  total: number;
  criadoEm: string;
};

async function resolveNames(
  rows: { entityType: string; entityId: string }[],
): Promise<Map<string, string>> {
  const invIds = rows.filter((r) => r.entityType === "invoice").map((r) => r.entityId);
  const custIds = rows.filter((r) => r.entityType === "customer").map((r) => r.entityId);
  const [invs, custs] = await Promise.all([
    invIds.length
      ? prisma.invoice.findMany({
          where: { id: { in: invIds } },
          select: { id: true, customer: { select: { name: true } } },
        })
      : Promise.resolve([]),
    custIds.length
      ? prisma.customer.findMany({ where: { id: { in: custIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const map = new Map<string, string>();
  for (const i of invs) map.set(`invoice:${i.id}`, i.customer.name);
  for (const c of custs) map.set(`customer:${c.id}`, c.name);
  return map;
}

export async function fetchRecentNotes(limit = 100): Promise<ActivityNote[]> {
  const rows = await prisma.note.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  const names = await resolveNames(rows);
  return rows.map((n) => ({
    id: n.id,
    entityType: n.entityType,
    entityId: n.entityId,
    cliente: names.get(`${n.entityType}:${n.entityId}`) ?? "",
    autor: n.author,
    texto: n.body,
    criadoEm: n.createdAt.toISOString(),
  }));
}

export async function fetchRecentFollowUps(limit = 100): Promise<ActivityFollowUp[]> {
  const rows = await prisma.followUp.findMany({ orderBy: { dueAt: "desc" }, take: limit });
  const names = await resolveNames(rows);
  return rows.map((f) => ({
    id: f.id,
    entityType: f.entityType,
    entityId: f.entityId,
    cliente: names.get(`${f.entityType}:${f.entityId}`) ?? "",
    canal: f.channel,
    vencimento: f.dueAt.toISOString(),
    status: f.status,
    descricao: f.body,
  }));
}

export async function fetchRecentAgreements(limit = 100): Promise<ActivityAgreement[]> {
  const rows = await prisma.paymentAgreement.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      installmentRows: { select: { amount: true } },
      originalInvoice: { select: { id: true, customer: { select: { name: true } } } },
    },
  });
  return rows.map((a) => ({
    id: a.id,
    fatura: a.originalInvoiceId,
    cliente: a.originalInvoice.customer.name,
    parcelas: a.installments,
    total: a.installmentRows.reduce((s, r) => s + Number(r.amount), 0),
    criadoEm: a.createdAt.toISOString(),
  }));
}
