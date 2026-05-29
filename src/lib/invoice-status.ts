import type { InvoiceStatus, PaymentStatus } from "@/generated/prisma/enums";

// State machine per the case spec:
//   open → in_negotiation → agreement_signed → paid
// with written_off and disputed as terminal branches reachable from active states.
export const STATUS_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  open: ["in_negotiation", "disputed", "written_off", "paid"],
  in_negotiation: ["agreement_signed", "disputed", "written_off", "paid", "open"],
  agreement_signed: ["paid", "written_off", "disputed"],
  paid: [],
  written_off: [],
  disputed: ["in_negotiation", "written_off", "open"],
};

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  open: "Em aberto",
  in_negotiation: "Em negociação",
  agreement_signed: "Acordo firmado",
  paid: "Paga",
  written_off: "Baixada",
  disputed: "Em disputa",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "Não paga",
  partial: "Parcial",
  paid: "Paga",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  BOLETO: "Boleto",
  PIX: "PIX",
  CREDIT_CARD: "Cartão",
  BANK_TRANSFER: "Transferência",
};

export const SEGMENT_LABELS: Record<string, string> = {
  SMB: "SMB",
  MID: "Mid-market",
  ENT: "Enterprise",
};
