// Prisma-free constants and types shared between the server query layer and the
// client table component. Keeping these out of `invoices.ts` (which imports the
// Prisma client) prevents Prisma from being pulled into the browser bundle.

export const PAGE_SIZE = 50;

// "Todas" can include the full 8k rows; we only ship the 1500 highest-risk to
// the client so the in-memory dataset stays light.
export const DATASET_CAP = 1500;

export type SortField = "riskScore" | "amount" | "dueDate" | "customer" | "updatedAt";
export type SortDir = "asc" | "desc";
export type ScopePreset = "unpaid" | "overdue" | "all";

// Plain, serializable row shipped to the client component. Decimals are
// converted to numbers and dates to ISO strings so the RSC boundary stays clean.
export type InvoiceRow = {
  id: string;
  customerId: string;
  customerName: string;
  segment: string;
  paymentMethod: string;
  amount: number;
  amountPaid: number;
  open: number;
  dueDate: string;
  status: string;
  paymentStatus: string;
  attempts: number;
  riskScore: number;
};
