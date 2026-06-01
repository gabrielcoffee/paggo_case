// Prisma-free constants/types shared between the customer query layer and the
// client table component.

export const PAGE_SIZE = 50;

// One row per customer with the aggregates needed for triage (computed server-side).
export type CustomerRow = {
  id: string;
  name: string;
  segment: string;
  creditLimit: number;
  openAr: number; // open balance across unpaid invoices
  overdueAr: number; // open balance on overdue invoices
  invoiceCount: number;
  overdueCount: number;
  maxRisk: number; // highest risk score among unpaid invoices
};
