import { describe, it, expect } from "vitest";
import { computeRisk, riskTier, type RiskInput, type RiskResult } from "@/lib/risk";

const TODAY = new Date("2026-04-01");

function input(over: Partial<RiskInput> = {}): RiskInput {
  return {
    amount: 1000,
    amountPaid: 0,
    dueDate: new Date("2026-04-01"),
    segment: "SMB",
    paymentMethod: "PIX",
    attempts: 0,
    previousLateInvoicesSnapshot: 0,
    openBalanceSnapshot: 0,
    creditLimit: 100000,
    ...over,
  };
}

function pts(r: RiskResult, rule: string): number | undefined {
  return r.factors.find((f) => f.rule === rule)?.points;
}

describe("computeRisk", () => {
  it("scores a fully-paid invoice at 0 with no factors", () => {
    const r = computeRisk(input({ amount: 1000, amountPaid: 1000 }), TODAY);
    expect(r.score).toBe(0);
    expect(r.factors).toEqual([]);
  });

  it("caps balance_at_risk at 30 points for recoverable >= 25k", () => {
    const r = computeRisk(input({ amount: 25000 }), TODAY);
    expect(pts(r, "balance_at_risk")).toBe(30);
  });

  it("scales balance_at_risk linearly (12.5k → 15)", () => {
    const r = computeRisk(input({ amount: 12500 }), TODAY);
    expect(pts(r, "balance_at_risk")).toBe(15);
  });

  it("gives full aging (20) at 60 days overdue", () => {
    const r = computeRisk(input({ dueDate: new Date("2026-01-31") }), TODAY);
    expect(pts(r, "aging")).toBe(20);
  });

  it("does not score aging for a not-yet-due invoice", () => {
    const r = computeRisk(input({ dueDate: new Date("2026-05-01") }), TODAY);
    expect(pts(r, "aging")).toBeUndefined();
  });

  it("gives full chronicity (20) at 5+ prior late invoices", () => {
    const r = computeRisk(input({ previousLateInvoicesSnapshot: 5 }), TODAY);
    expect(pts(r, "chronicity")).toBe(20);
  });

  it("flags an enterprise first-time-late invoice (+15)", () => {
    const r = computeRisk(
      input({ segment: "ENT", previousLateInvoicesSnapshot: 0, dueDate: new Date("2026-03-31") }),
      TODAY,
    );
    expect(pts(r, "ent_first_late")).toBe(15);
  });

  it("does NOT flag ent_first_late when the customer has prior lates", () => {
    const r = computeRisk(
      input({ segment: "ENT", previousLateInvoicesSnapshot: 2, dueDate: new Date("2026-03-31") }),
      TODAY,
    );
    expect(pts(r, "ent_first_late")).toBeUndefined();
  });

  it("flags a stuck boleto (>2 attempts, +10)", () => {
    const r = computeRisk(input({ paymentMethod: "BOLETO", attempts: 3 }), TODAY);
    expect(pts(r, "boleto_stuck")).toBe(10);
  });

  it("does not flag boleto_stuck at 2 attempts", () => {
    const r = computeRisk(input({ paymentMethod: "BOLETO", attempts: 2 }), TODAY);
    expect(pts(r, "boleto_stuck")).toBeUndefined();
  });

  it("never exceeds 100", () => {
    const r = computeRisk(
      input({
        amount: 200000,
        dueDate: new Date("2025-12-01"),
        previousLateInvoicesSnapshot: 9,
        paymentMethod: "BOLETO",
        attempts: 5,
      }),
      TODAY,
    );
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe("riskTier", () => {
  it.each([
    [55, "critical"],
    [70, "critical"],
    [54, "high"],
    [40, "high"],
    [39, "medium"],
    [20, "medium"],
    [19, "low"],
    [1, "low"],
    [0, "low"],
  ])("score %i → %s", (score, tier) => {
    expect(riskTier(score as number)).toBe(tier);
  });
});
