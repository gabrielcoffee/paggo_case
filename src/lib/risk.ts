import { differenceInDays, parseISO } from "date-fns";

export type RiskInput = {
  amount: number;
  amountPaid: number;
  dueDate: Date;
  segment: "SMB" | "MID" | "ENT";
  paymentMethod: "BOLETO" | "PIX" | "CREDIT_CARD" | "BANK_TRANSFER";
  attempts: number;
  previousLateInvoicesSnapshot: number;
  openBalanceSnapshot: number;
  creditLimit: number;
};

export type RiskFactor = {
  rule: string;
  points: number;
  description: string;
};

export type RiskResult = {
  score: number;
  factors: RiskFactor[];
};

// Calibration constants tuned to the dataset's observed distribution.
// Overdue balance: p90 ~R$11k, p95 ~R$20k, long tail to ~R$156k.
const BALANCE_CAP = 25000;
// Aging: max observed ~75 days, p90 ~57 days.
const AGING_CAP_DAYS = 60;
// Chronicity: previousLate ranges 0..9, ~200 invoices at 3+, 86 at 5+.
const CHRONICITY_CAP = 5;

export function computeRisk(input: RiskInput, today: Date): RiskResult {
  const recoverable = Math.max(0, input.amount - input.amountPaid);

  // A fully-settled invoice is never a collections priority, regardless of the
  // customer's history. Short-circuit to keep paid rows out of the ranking.
  if (recoverable <= 0) {
    return { score: 0, factors: [] };
  }

  const factors: RiskFactor[] = [];
  const daysOverdue = differenceInDays(today, input.dueDate);

  // Rule 1 — Balance at risk (0-30). Standalone signal: more money on the line
  // is more worth the analyst's finite time. Linear up to BALANCE_CAP.
  const points1 = Math.round(Math.min(recoverable / BALANCE_CAP, 1) * 30);
  if (points1 > 0) {
    factors.push({
      rule: "balance_at_risk",
      points: points1,
      description: `R$ ${recoverable.toFixed(0)} em aberto`,
    });
  }

  // Rule 2 — Aging (0-20). Only for overdue invoices. Older debt is harder to
  // recover and signals an unresponsive account. Linear up to AGING_CAP_DAYS.
  if (daysOverdue > 0) {
    const points2 = Math.round(Math.min(daysOverdue / AGING_CAP_DAYS, 1) * 20);
    if (points2 > 0) {
      factors.push({
        rule: "aging",
        points: points2,
        description: `${daysOverdue} dias em atraso`,
      });
    }
  }

  // Rule 3 — Chronicity (0-20). Customers who are repeatedly late are likelier
  // to be late again; their open invoices deserve earlier attention.
  if (input.previousLateInvoicesSnapshot > 0) {
    const points3 = Math.round(
      Math.min(input.previousLateInvoicesSnapshot / CHRONICITY_CAP, 1) * 20,
    );
    if (points3 > 0) {
      factors.push({
        rule: "chronicity",
        points: points3,
        description: `${input.previousLateInvoicesSnapshot} atrasos nos ultimos 12 meses`,
      });
    }
  }

  // Rule 4 — Enterprise first-time late (binary 15). ENT accounts normally pay
  // on time; a first miss is usually operational (lost boleto, process change),
  // high value and highly recoverable with a single touch.
  if (
    input.segment === "ENT" &&
    input.previousLateInvoicesSnapshot === 0 &&
    daysOverdue > 0
  ) {
    factors.push({
      rule: "ent_first_late",
      points: 15,
      description: "Enterprise em atraso pela primeira vez (alta recuperabilidade)",
    });
  }

  // Rule 5 — Boleto stuck (binary 10). Several failed attempts on a boleto is a
  // technical problem, not unwillingness to pay. Offering PIX is an easy win.
  if (input.paymentMethod === "BOLETO" && input.attempts > 2) {
    factors.push({
      rule: "boleto_stuck",
      points: 10,
      description: `${input.attempts} tentativas em boleto - sugerir PIX`,
    });
  }

  const score = Math.min(
    factors.reduce((sum, f) => sum + f.points, 0),
    100,
  );

  return { score, factors };
}

// Thresholds calibrated to the observed score distribution (no score reaches
// the theoretical max of 100 because the worst-case factor combination does not
// occur in the data). At these cuts: ~24 critical, ~94 high, ~634 medium.
export function riskTier(score: number): "low" | "medium" | "high" | "critical" {
  if (score >= 55) return "critical";
  if (score >= 40) return "high";
  if (score >= 20) return "medium";
  return "low";
}

export function appToday(): Date {
  const env = process.env.APP_TODAY;
  if (!env) throw new Error("APP_TODAY env var must be set (e.g. 2026-04-01)");
  return parseISO(env);
}
