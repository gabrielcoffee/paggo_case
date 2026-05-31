import { addDays } from "date-fns";

// Prisma-free so the agreement preview can run in the client (importing the
// Prisma client into a browser bundle breaks Turbopack). All math is in integer
// cents to avoid floating-point drift; the server converts to Decimal on write.

export type ScheduleRow = {
  installmentNumber: number;
  dueDate: string; // ISO
  amountCents: number;
};

export type Schedule = {
  totalCents: number;
  rows: ScheduleRow[];
};

export function buildSchedule(input: {
  baseCents: number;
  installments: number;
  discountPct?: number;
  feePct?: number;
  firstDueDate: string | Date;
  intervalDays?: number;
}): Schedule {
  const {
    baseCents,
    installments,
    discountPct = 0,
    feePct = 0,
    firstDueDate,
    intervalDays = 30,
  } = input;

  const totalCents = Math.round(baseCents * (1 - discountPct / 100) * (1 + feePct / 100));
  const per = Math.floor(totalCents / installments);
  const start = typeof firstDueDate === "string" ? new Date(firstDueDate) : firstDueDate;

  const rows: ScheduleRow[] = [];
  let allocated = 0;
  for (let i = 1; i <= installments; i++) {
    // Last installment absorbs the rounding remainder so the parts sum to total.
    const amountCents = i === installments ? totalCents - allocated : per;
    allocated += amountCents;
    rows.push({
      installmentNumber: i,
      dueDate: addDays(start, (i - 1) * intervalDays).toISOString(),
      amountCents,
    });
  }
  return { totalCents, rows };
}
