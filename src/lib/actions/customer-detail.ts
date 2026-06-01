"use server";

import { prisma } from "@/lib/prisma";
import { appToday } from "@/lib/risk";
import { daysOverdue } from "@/lib/aging";
import type {
  DetailNote,
  DetailAudit,
  DetailFollowUp,
} from "@/lib/actions/invoice-detail";

export type CustomerInvoiceRow = {
  id: string;
  open: number;
  dueDate: string;
  status: string;
  paymentStatus: string;
  riskScore: number;
};

export type CustomerDetail = {
  id: string;
  name: string;
  segment: string;
  creditLimit: number;
  createdAt: string;
  openAr: number;
  overdueAr: number;
  invoiceCount: number;
  overdueCount: number;
  maxRisk: number;
  invoices: CustomerInvoiceRow[];
  notes: DetailNote[];
  auditEvents: DetailAudit[];
  followUps: DetailFollowUp[];
};

export async function fetchCustomerDetail(id: string): Promise<CustomerDetail | null> {
  const c = await prisma.customer.findUnique({
    where: { id },
    include: {
      invoices: {
        orderBy: [{ riskScore: "desc" }, { id: "asc" }],
        select: {
          id: true,
          amount: true,
          amountPaid: true,
          dueDate: true,
          status: true,
          paymentStatus: true,
          riskScore: true,
        },
      },
    },
  });
  if (!c) return null;

  const today = appToday();
  const [notes, auditEvents, followUps] = await Promise.all([
    prisma.note.findMany({
      where: { entityType: "customer", entityId: id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditEvent.findMany({
      where: { entityType: "customer", entityId: id },
      orderBy: { timestamp: "desc" },
    }),
    prisma.followUp.findMany({
      where: { entityType: "customer", entityId: id },
      orderBy: { dueAt: "asc" },
    }),
  ]);

  let openAr = 0;
  let overdueAr = 0;
  let overdueCount = 0;
  let maxRisk = 0;
  const invoices: CustomerInvoiceRow[] = c.invoices.map((i) => {
    const open = Number(i.amount) - Number(i.amountPaid);
    const unpaid = i.paymentStatus !== "paid";
    const od = daysOverdue(i.dueDate, today);
    if (unpaid) {
      openAr += open;
      if (i.riskScore > maxRisk) maxRisk = i.riskScore;
      if (od > 0) {
        overdueAr += open;
        overdueCount += 1;
      }
    }
    return {
      id: i.id,
      open,
      dueDate: i.dueDate.toISOString(),
      status: i.status,
      paymentStatus: i.paymentStatus,
      riskScore: i.riskScore,
    };
  });

  return {
    id: c.id,
    name: c.name,
    segment: c.segment,
    creditLimit: Number(c.creditLimit),
    createdAt: c.createdAt.toISOString(),
    openAr,
    overdueAr,
    invoiceCount: c.invoices.length,
    overdueCount,
    maxRisk,
    invoices,
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
  };
}
