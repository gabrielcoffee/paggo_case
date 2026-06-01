import { describe, it, expect, afterAll, vi } from "vitest";

// next/cache throws outside a request context; stub it like the other integration tests.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  getUser: vi.fn(async () => ({ id: "TEST-USER", email: "test@paggo.dev" })),
}));

import { prisma } from "@/lib/prisma";
import { createAutomation, runAutomationNow, deleteAutomation } from "@/lib/actions/automations";

afterAll(async () => {
  await prisma.$disconnect();
});

describe("automation engine (plumbing, zero-match)", () => {
  it("creates, runs with no matches, records a run and advances the schedule", async () => {
    // Customer note with an impossible threshold → matches nothing, writes nothing.
    const created = await createAutomation({
      name: "TEST automation (zero match)",
      target: "customer",
      condition: { segment: [], minOpenAr: 0, minOverdueAr: 0, minOverdueCount: 999999 },
      effect: { kind: "note", bodyTemplate: "TEST {cliente}" },
      schedule: { frequency: "weekly", startDate: "2026-06-01", timeOfDay: "10:00" },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const before = await prisma.automationRule.findUnique({ where: { id: created.id } });
    expect(before?.lastRunAt).toBeNull();

    const res = await runAutomationNow(created.id);
    expect(res.matched).toBe(0);
    expect(res.acted).toBe(0);
    expect(res.ok).toBe(true);

    const runs = await prisma.automationRun.findMany({ where: { automationId: created.id } });
    expect(runs.length).toBe(1);
    expect(runs[0].status).toBe("success");

    const after = await prisma.automationRule.findUnique({ where: { id: created.id } });
    expect(after?.lastRunAt).not.toBeNull();
    expect(after?.nextRunAt).toBeTruthy();

    await deleteAutomation(created.id);
    expect(await prisma.automationRule.findUnique({ where: { id: created.id } })).toBeNull();
    // runs cascade-deleted with the rule
    expect(await prisma.automationRun.count({ where: { automationId: created.id } })).toBe(0);
  });
});
