"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { canTransition } from "@/lib/invoice-status";
import { recordAudit } from "@/lib/audit";
import { recomputeInvoiceRisk } from "@/lib/risk-recompute";
import { buildSchedule } from "@/lib/agreement";
import { appToday } from "@/lib/risk";

// No auth in this prototype. Writes are attributed via a context object so the
// same action serves both the analyst (default) and the AI agent (origin=agent).
export type WriteCtx = { origin: "analyst" | "agent"; actor: string };
const ANALYST: WriteCtx = { origin: "analyst", actor: "analyst" };

export type ActionResult = { ok: true } | { ok: false; error: string };

function fail(error: string): ActionResult {
  return { ok: false, error };
}

// Refresh the list + dashboard in the background. Only writes that change a
// portfolio-visible field (status, payment, agreement) call this — notes and
// follow-ups don't move any aggregate, so they skip the heavy re-render. The UI
// already updated optimistically; this just keeps other views eventually consistent.
function revalidate() {
  revalidatePath("/invoices");
  revalidatePath("/");
}

const STATUSES = [
  "open",
  "in_negotiation",
  "agreement_signed",
  "paid",
  "written_off",
  "disputed",
] as const;

// --- updateInvoiceStatus -------------------------------------------------

const updateStatusSchema = z.object({
  invoiceId: z.string().min(1),
  to: z.enum(STATUSES),
  note: z.string().trim().max(2000).optional(),
});

export async function updateInvoiceStatus(
  input: z.infer<typeof updateStatusSchema>,
  ctx: WriteCtx = ANALYST,
): Promise<ActionResult> {
  const parsed = updateStatusSchema.safeParse(input);
  if (!parsed.success) return fail("Dados inválidos.");
  const { invoiceId, to, note } = parsed.data;

  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) return fail("Fatura não encontrada.");
  if (inv.status === to) return fail("A fatura já está nesse status.");
  if (!canTransition(inv.status, to)) {
    return fail(`Transição inválida: ${inv.status} → ${to}.`);
  }

  await prisma.$transaction(async (tx) => {
    const markingPaid = to === "paid";
    await tx.invoice.update({
      where: { id: invoiceId },
      data: markingPaid
        ? {
            status: to,
            paymentStatus: "paid",
            amountPaid: inv.amount,
            paidDate: appToday(),
          }
        : { status: to },
    });

    // Marking paid changes recoverable balance → risk must be recomputed.
    if (markingPaid) await recomputeInvoiceRisk(tx, invoiceId);

    if (note) {
      await tx.note.create({
        data: { entityType: "invoice", entityId: invoiceId, author: ctx.actor, body: note },
      });
    }

    await recordAudit(tx, {
      entityType: "invoice",
      entityId: invoiceId,
      action: "status_change",
      origin: ctx.origin,
      actor: ctx.actor,
      payload: { from: inv.status, to, note: note ?? null },
    });
  });

  revalidate();
  return { ok: true };
}

// --- addNote -------------------------------------------------------------

const addNoteSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  body: z.string().trim().min(1, "Nota vazia.").max(2000),
});

export async function addNote(
  input: z.infer<typeof addNoteSchema>,
  ctx: WriteCtx = ANALYST,
): Promise<ActionResult> {
  const parsed = addNoteSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const { entityType, entityId, body } = parsed.data;

  await prisma.$transaction(async (tx) => {
    const created = await tx.note.create({
      data: { entityType, entityId, author: ctx.actor, body },
    });
    await recordAudit(tx, {
      entityType,
      entityId,
      action: "note_added",
      origin: ctx.origin,
      actor: ctx.actor,
      payload: { noteId: created.id },
    });
  });

  return { ok: true };
}

// --- scheduleFollowUp ----------------------------------------------------

const followUpSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  dueAt: z.string().datetime().or(z.string().min(1)),
  channel: z.enum(["phone", "email", "whatsapp"]),
  body: z.string().trim().min(1, "Descreva o follow-up.").max(2000),
  assignee: z.string().trim().max(120).optional(),
});

export async function scheduleFollowUp(
  input: z.infer<typeof followUpSchema>,
  ctx: WriteCtx = ANALYST,
): Promise<ActionResult> {
  const parsed = followUpSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const { entityType, entityId, dueAt, channel, body, assignee } = parsed.data;

  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return fail("Data inválida.");

  await prisma.$transaction(async (tx) => {
    const created = await tx.followUp.create({
      data: {
        entityType,
        entityId,
        dueAt: due,
        channel,
        body,
        assignee: assignee || null,
        status: "pending",
        createdBy: ctx.actor,
      },
    });
    await recordAudit(tx, {
      entityType,
      entityId,
      action: "followup_scheduled",
      origin: ctx.origin,
      actor: ctx.actor,
      payload: { followUpId: created.id, channel, dueAt: due.toISOString() },
    });
  });

  return { ok: true };
}

// --- createPaymentAgreement ----------------------------------------------

const agreementSchema = z.object({
  invoiceId: z.string().min(1),
  installments: z.number().int().min(1).max(36),
  discountPct: z.number().min(0).max(100).optional(),
  feePct: z.number().min(0).max(100).optional(),
  firstDueDate: z.string().min(1),
  intervalDays: z.number().int().min(1).max(180).optional(),
});

export async function createPaymentAgreement(
  input: z.infer<typeof agreementSchema>,
  ctx: WriteCtx = ANALYST,
): Promise<ActionResult> {
  const parsed = agreementSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const { invoiceId, installments, discountPct, feePct, firstDueDate, intervalDays } =
    parsed.data;

  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!inv) return fail("Fatura não encontrada.");

  const baseCents = Math.round((Number(inv.amount) - Number(inv.amountPaid)) * 100);
  if (baseCents <= 0) return fail("Fatura sem saldo em aberto.");

  const moveToAgreement =
    inv.status !== "agreement_signed" && canTransition(inv.status, "agreement_signed");
  if (inv.status !== "agreement_signed" && !moveToAgreement) {
    return fail(`Não é possível firmar acordo a partir de ${inv.status}.`);
  }

  const schedule = buildSchedule({
    baseCents,
    installments,
    discountPct,
    feePct,
    firstDueDate,
    intervalDays,
  });

  await prisma.$transaction(async (tx) => {
    const agreement = await tx.paymentAgreement.create({
      data: {
        originalInvoiceId: invoiceId,
        installments,
        discountPct: discountPct != null ? new Prisma.Decimal(discountPct) : null,
        feePct: feePct != null ? new Prisma.Decimal(feePct) : null,
        createdBy: ctx.actor,
        installmentRows: {
          create: schedule.rows.map((r) => ({
            installmentNumber: r.installmentNumber,
            dueDate: new Date(r.dueDate),
            amount: new Prisma.Decimal(r.amountCents).dividedBy(100),
            status: "open",
          })),
        },
      },
    });

    if (moveToAgreement) {
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: "agreement_signed" },
      });
    }

    await recordAudit(tx, {
      entityType: "invoice",
      entityId: invoiceId,
      action: "agreement_created",
      origin: ctx.origin,
      actor: ctx.actor,
      payload: {
        agreementId: agreement.id,
        installments,
        totalCents: schedule.totalCents,
        discountPct: discountPct ?? null,
        feePct: feePct ?? null,
      },
    });
  });

  revalidate();
  return { ok: true };
}

// --- updateNote / deleteNote ---------------------------------------------

const updateNoteSchema = z.object({
  noteId: z.string().min(1),
  body: z.string().trim().min(1, "Nota vazia.").max(2000),
});

export async function updateNote(
  input: z.infer<typeof updateNoteSchema>,
  ctx: WriteCtx = ANALYST,
): Promise<ActionResult> {
  const parsed = updateNoteSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const { noteId, body } = parsed.data;

  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note) return fail("Nota não encontrada.");

  await prisma.$transaction(async (tx) => {
    await tx.note.update({ where: { id: noteId }, data: { body } });
    await recordAudit(tx, {
      entityType: note.entityType,
      entityId: note.entityId,
      action: "note_updated",
      origin: ctx.origin,
      actor: ctx.actor,
      payload: { noteId },
    });
  });

  return { ok: true };
}

export async function deleteNote(
  noteId: string,
  ctx: WriteCtx = ANALYST,
): Promise<ActionResult> {
  if (!noteId) return fail("Nota inválida.");
  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note) return fail("Nota não encontrada.");

  await prisma.$transaction(async (tx) => {
    await tx.note.delete({ where: { id: noteId } });
    await recordAudit(tx, {
      entityType: note.entityType,
      entityId: note.entityId,
      action: "note_deleted",
      origin: ctx.origin,
      actor: ctx.actor,
      payload: { noteId },
    });
  });

  return { ok: true };
}

// --- updateAgreement / deleteAgreement -----------------------------------

const updateAgreementSchema = z.object({
  agreementId: z.string().min(1),
  installments: z.number().int().min(1).max(36),
  discountPct: z.number().min(0).max(100).optional(),
  feePct: z.number().min(0).max(100).optional(),
  firstDueDate: z.string().min(1),
  intervalDays: z.number().int().min(1).max(180).optional(),
});

export async function updateAgreement(
  input: z.infer<typeof updateAgreementSchema>,
  ctx: WriteCtx = ANALYST,
): Promise<ActionResult> {
  const parsed = updateAgreementSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const { agreementId, installments, discountPct, feePct, firstDueDate, intervalDays } =
    parsed.data;

  const ag = await prisma.paymentAgreement.findUnique({ where: { id: agreementId } });
  if (!ag) return fail("Acordo não encontrado.");
  const inv = await prisma.invoice.findUnique({ where: { id: ag.originalInvoiceId } });
  if (!inv) return fail("Fatura não encontrada.");

  const baseCents = Math.round((Number(inv.amount) - Number(inv.amountPaid)) * 100);
  if (baseCents <= 0) return fail("Fatura sem saldo em aberto.");

  const schedule = buildSchedule({
    baseCents,
    installments,
    discountPct,
    feePct,
    firstDueDate,
    intervalDays,
  });

  await prisma.$transaction(async (tx) => {
    await tx.agreementInstallment.deleteMany({ where: { agreementId } });
    await tx.paymentAgreement.update({
      where: { id: agreementId },
      data: {
        installments,
        discountPct: discountPct != null ? new Prisma.Decimal(discountPct) : null,
        feePct: feePct != null ? new Prisma.Decimal(feePct) : null,
        installmentRows: {
          create: schedule.rows.map((r) => ({
            installmentNumber: r.installmentNumber,
            dueDate: new Date(r.dueDate),
            amount: new Prisma.Decimal(r.amountCents).dividedBy(100),
            status: "open",
          })),
        },
      },
    });
    await recordAudit(tx, {
      entityType: "invoice",
      entityId: ag.originalInvoiceId,
      action: "agreement_updated",
      origin: ctx.origin,
      actor: ctx.actor,
      payload: { agreementId, installments, totalCents: schedule.totalCents },
    });
  });

  revalidate();
  return { ok: true };
}

export async function deleteAgreement(
  agreementId: string,
  ctx: WriteCtx = ANALYST,
): Promise<ActionResult> {
  if (!agreementId) return fail("Acordo inválido.");
  const ag = await prisma.paymentAgreement.findUnique({ where: { id: agreementId } });
  if (!ag) return fail("Acordo não encontrado.");

  await prisma.$transaction(async (tx) => {
    await tx.agreementInstallment.deleteMany({ where: { agreementId } });
    await tx.paymentAgreement.delete({ where: { id: agreementId } });
    await recordAudit(tx, {
      entityType: "invoice",
      entityId: ag.originalInvoiceId,
      action: "agreement_deleted",
      origin: ctx.origin,
      actor: ctx.actor,
      payload: { agreementId },
    });
  });

  revalidate();
  return { ok: true };
}
