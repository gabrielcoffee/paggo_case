"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { appToday, computeRisk } from "@/lib/risk";

export type CreateResult<T> = (T & { ok: true }) | { ok: false; error: string };

const SEGMENTS = ["SMB", "MID", "ENT"] as const;
const METHODS = ["BOLETO", "PIX", "CREDIT_CARD", "BANK_TRANSFER"] as const;

// Next sequential id for a zero-padded prefix scheme ("CUST-01547", "INV-01234").
async function nextCustomerId(): Promise<string> {
  const last = await prisma.customer.findFirst({
    where: { id: { startsWith: "CUST-" } },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  const n = last ? parseInt(last.id.slice(5), 10) : 0;
  return "CUST-" + String((Number.isNaN(n) ? 0 : n) + 1).padStart(5, "0");
}

async function nextInvoiceId(): Promise<string> {
  const last = await prisma.invoice.findFirst({
    where: { id: { startsWith: "INV-" } },
    orderBy: { id: "desc" },
    select: { id: true },
  });
  const n = last ? parseInt(last.id.slice(4), 10) : 0;
  return "INV-" + String((Number.isNaN(n) ? 0 : n) + 1).padStart(5, "0");
}

const customerSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório.").max(200),
  segment: z.enum(SEGMENTS),
  creditLimit: z.number().min(0),
});

export async function createCustomer(
  input: z.infer<typeof customerSchema>,
): Promise<CreateResult<{ id: string; name: string }>> {
  const parsed = customerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { name, segment, creditLimit } = parsed.data;
  const id = await nextCustomerId();
  await prisma.customer.create({
    data: { id, name, segment, creditLimit: new Prisma.Decimal(creditLimit) },
  });
  revalidatePath("/customers");
  return { ok: true, id, name };
}

const invoiceSchema = z
  .object({
    customerId: z.string().min(1).optional(),
    newCustomer: customerSchema.optional(),
    amount: z.number().positive("Valor deve ser maior que zero."),
    dueDate: z.string().min(1, "Vencimento obrigatório."),
    paymentMethod: z.enum(METHODS),
  })
  .refine((d) => d.customerId || d.newCustomer, {
    message: "Informe um cliente existente ou um novo.",
  });

export async function createInvoice(
  input: z.infer<typeof invoiceSchema>,
): Promise<CreateResult<{ id: string }>> {
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { customerId, newCustomer, amount, dueDate, paymentMethod } = parsed.data;

  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return { ok: false, error: "Data inválida." };

  // Resolve the customer (existing or freshly created), keeping the fields the
  // risk model needs.
  let custId: string;
  let segment: (typeof SEGMENTS)[number];
  let creditLimit: number;
  if (newCustomer) {
    custId = await nextCustomerId();
    await prisma.customer.create({
      data: {
        id: custId,
        name: newCustomer.name,
        segment: newCustomer.segment,
        creditLimit: new Prisma.Decimal(newCustomer.creditLimit),
      },
    });
    segment = newCustomer.segment;
    creditLimit = newCustomer.creditLimit;
  } else {
    const c = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!c) return { ok: false, error: "Cliente não encontrado." };
    custId = c.id;
    segment = c.segment as (typeof SEGMENTS)[number];
    creditLimit = Number(c.creditLimit);
  }

  const today = appToday();
  const risk = computeRisk(
    {
      amount,
      amountPaid: 0,
      dueDate: due,
      segment,
      paymentMethod,
      attempts: 0,
      previousLateInvoicesSnapshot: 0,
      openBalanceSnapshot: amount,
      creditLimit,
    },
    today,
  );

  const id = await nextInvoiceId();
  await prisma.invoice.create({
    data: {
      id,
      customerId: custId,
      issueDate: today,
      dueDate: due,
      amount: new Prisma.Decimal(amount),
      amountPaid: new Prisma.Decimal(0),
      paymentMethod,
      attempts: 0,
      previousLateInvoicesSnapshot: 0,
      openBalanceSnapshot: new Prisma.Decimal(amount),
      riskScore: risk.score,
      riskFactors: risk.factors as unknown as Prisma.InputJsonValue,
    },
  });

  revalidatePath("/invoices");
  revalidatePath("/customers");
  revalidatePath("/");
  return { ok: true, id };
}
