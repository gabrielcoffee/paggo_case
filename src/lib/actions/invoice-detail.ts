"use server";

import { prisma } from "@/lib/prisma";
import type { RiskFactor } from "@/lib/risk";

// Server action (callable from the client Sheet) returning the full, serializable
// detail for one invoice: core fields + polymorphic notes/audit/follow-ups +
// payment agreements with their installments. Decimals → numbers, dates → ISO.

export type DetailNote = { id: string; author: string; body: string; createdAt: string };
export type DetailAudit = {
  id: string;
  action: string;
  origin: string;
  actor: string;
  payload: unknown;
  timestamp: string;
};
export type DetailFollowUp = {
  id: string;
  dueAt: string;
  channel: string;
  status: string;
  body: string;
  assignee: string | null;
  createdBy: string;
};
export type DetailInstallment = {
  id: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  status: string;
};
export type DetailAgreement = {
  id: string;
  installments: number;
  discountPct: number | null;
  feePct: number | null;
  createdBy: string;
  createdAt: string;
  installmentRows: DetailInstallment[];
};

export type InvoiceDetail = {
  id: string;
  customerId: string;
  customerName: string;
  segment: string;
  paymentMethod: string;
  amount: number;
  amountPaid: number;
  open: number;
  issueDate: string;
  dueDate: string;
  paidDate: string | null;
  attempts: number;
  status: string;
  paymentStatus: string;
  riskScore: number;
  riskFactors: RiskFactor[];
  notes: DetailNote[];
  auditEvents: DetailAudit[];
  followUps: DetailFollowUp[];
  agreements: DetailAgreement[];
};

export async function fetchInvoiceDetail(id: string): Promise<InvoiceDetail | null> {
  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: { customer: true, agreements: { include: { installmentRows: true } } },
  });
  if (!inv) return null;

  const [notes, auditEvents, followUps] = await Promise.all([
    prisma.note.findMany({
      where: { entityType: "invoice", entityId: id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditEvent.findMany({
      where: { entityType: "invoice", entityId: id },
      orderBy: { timestamp: "desc" },
    }),
    prisma.followUp.findMany({
      where: { entityType: "invoice", entityId: id },
      orderBy: { dueAt: "asc" },
    }),
  ]);

  const amount = Number(inv.amount);
  const amountPaid = Number(inv.amountPaid);

  return {
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
    attempts: inv.attempts,
    status: inv.status,
    paymentStatus: inv.paymentStatus,
    riskScore: inv.riskScore,
    riskFactors: (inv.riskFactors as unknown as RiskFactor[]) ?? [],
    notes: notes.map((n) => ({
      id: n.id,
      author: n.author,
      body: n.body,
      createdAt: n.createdAt.toISOString(),
    })),
    auditEvents: auditEvents.map((a) => ({
      id: a.id,
      action: a.action,
      origin: a.origin,
      actor: a.actor,
      payload: a.payload,
      timestamp: a.timestamp.toISOString(),
    })),
    followUps: followUps.map((f) => ({
      id: f.id,
      dueAt: f.dueAt.toISOString(),
      channel: f.channel,
      status: f.status,
      body: f.body,
      assignee: f.assignee,
      createdBy: f.createdBy,
    })),
    agreements: inv.agreements.map((ag) => ({
      id: ag.id,
      installments: ag.installments,
      discountPct: ag.discountPct != null ? Number(ag.discountPct) : null,
      feePct: ag.feePct != null ? Number(ag.feePct) : null,
      createdBy: ag.createdBy,
      createdAt: ag.createdAt.toISOString(),
      installmentRows: ag.installmentRows
        .sort((a, b) => a.installmentNumber - b.installmentNumber)
        .map((r) => ({
          id: r.id,
          installmentNumber: r.installmentNumber,
          dueDate: r.dueDate.toISOString(),
          amount: Number(r.amount),
          status: r.status,
        })),
    })),
  };
}
