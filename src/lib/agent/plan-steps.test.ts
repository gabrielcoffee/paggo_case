import { describe, it, expect } from "vitest";
import { planStepSchema, planStepsSchema, describeStep, type PlanStep } from "@/lib/agent/plan-steps";

describe("planStepSchema", () => {
  it("accepts a valid status step", () => {
    const r = planStepSchema.safeParse({ kind: "status", invoiceId: "INV-1", to: "in_negotiation" });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown kind", () => {
    const r = planStepSchema.safeParse({ kind: "nuke", invoiceId: "INV-1" });
    expect(r.success).toBe(false);
  });

  it("does not allow written_off via a status step (writeoff is its own kind)", () => {
    const r = planStepSchema.safeParse({ kind: "status", invoiceId: "INV-1", to: "written_off" });
    expect(r.success).toBe(false);
  });

  it("requires installments on an agreement step", () => {
    const r = planStepSchema.safeParse({ kind: "agreement", invoiceId: "INV-1", firstDueDate: "2026-05-01" });
    expect(r.success).toBe(false);
  });
});

describe("planStepsSchema", () => {
  it("rejects an empty plan", () => {
    expect(planStepsSchema.safeParse([]).success).toBe(false);
  });
});

describe("describeStep", () => {
  it("summarizes each kind on one line", () => {
    const steps: PlanStep[] = [
      { kind: "status", invoiceId: "INV-1", to: "in_negotiation" },
      { kind: "writeoff", invoiceId: "INV-2" },
      { kind: "agreement", invoiceId: "INV-3", installments: 3, firstDueDate: "2026-05-01" },
    ];
    expect(describeStep(steps[0])).toContain("in_negotiation");
    expect(describeStep(steps[1])).toContain("write-off");
    expect(describeStep(steps[2])).toContain("3x");
  });
});
