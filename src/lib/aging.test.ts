import { describe, it, expect } from "vitest";
import { subDays } from "date-fns";
import { daysOverdue, agingBucket } from "@/lib/aging";

const TODAY = new Date("2026-04-01");

describe("daysOverdue", () => {
  it("is 0 when due today", () => {
    expect(daysOverdue(TODAY, TODAY)).toBe(0);
  });
  it("counts calendar days past due", () => {
    expect(daysOverdue(subDays(TODAY, 31), TODAY)).toBe(31);
  });
  it("is negative for a future due date", () => {
    expect(daysOverdue(new Date("2026-04-10"), TODAY)).toBe(-9);
  });
});

describe("agingBucket", () => {
  it.each([
    [0, "not_due"],
    [1, "0-30"],
    [30, "0-30"],
    [31, "31-60"],
    [60, "31-60"],
    [61, "61-90"],
    [90, "61-90"],
    [91, "90+"],
  ])("%i days overdue → %s", (days, bucket) => {
    expect(agingBucket(subDays(TODAY, days as number), TODAY)).toBe(bucket);
  });

  it("buckets a future due date as not_due", () => {
    expect(agingBucket(new Date("2026-05-01"), TODAY)).toBe("not_due");
  });
});
