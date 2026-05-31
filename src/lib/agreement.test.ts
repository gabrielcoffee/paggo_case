import { describe, it, expect } from "vitest";
import { differenceInCalendarDays } from "date-fns";
import { buildSchedule } from "@/lib/agreement";

const FIRST = "2026-04-01";

describe("buildSchedule", () => {
  it("splits the base into N installments that sum exactly to the total", () => {
    const s = buildSchedule({ baseCents: 10000, installments: 3, firstDueDate: FIRST });
    expect(s.rows).toHaveLength(3);
    expect(s.rows.reduce((a, r) => a + r.amountCents, 0)).toBe(s.totalCents);
    expect(s.totalCents).toBe(10000);
  });

  it("puts the rounding remainder on the last installment", () => {
    const s = buildSchedule({ baseCents: 10000, installments: 3, firstDueDate: FIRST });
    expect(s.rows[0].amountCents).toBe(3333);
    expect(s.rows[1].amountCents).toBe(3333);
    expect(s.rows[2].amountCents).toBe(3334);
  });

  it("applies a percentage discount to the total", () => {
    const s = buildSchedule({
      baseCents: 10000,
      installments: 2,
      discountPct: 10,
      firstDueDate: FIRST,
    });
    expect(s.totalCents).toBe(9000);
    expect(s.rows.every((r) => r.amountCents === 4500)).toBe(true);
  });

  it("applies a percentage fee to the total", () => {
    const s = buildSchedule({
      baseCents: 10000,
      installments: 1,
      feePct: 10,
      firstDueDate: FIRST,
    });
    expect(s.totalCents).toBe(11000);
  });

  it("spaces due dates by intervalDays from the first", () => {
    const s = buildSchedule({
      baseCents: 9000,
      installments: 3,
      firstDueDate: FIRST,
      intervalDays: 30,
    });
    const d0 = new Date(s.rows[0].dueDate);
    const d1 = new Date(s.rows[1].dueDate);
    const d2 = new Date(s.rows[2].dueDate);
    expect(differenceInCalendarDays(d1, d0)).toBe(30);
    expect(differenceInCalendarDays(d2, d0)).toBe(60);
  });
});
