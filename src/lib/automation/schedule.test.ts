import { describe, it, expect } from "vitest";
import { computeNextRun } from "@/lib/automation/schedule";

// Assertions use local-time getters (getDate/getHours/getDay) so they don't
// depend on the runner's timezone.
describe("computeNextRun", () => {
  it("returns the start instant when start is in the future", () => {
    const next = computeNextRun({ frequency: "daily", startDate: "2026-06-10", timeOfDay: "10:00" }, new Date("2026-06-01T12:00:00"));
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(5); // June
    expect(next.getDate()).toBe(10);
    expect(next.getHours()).toBe(10);
    expect(next.getMinutes()).toBe(0);
  });

  it("daily: advances to the next day's slot after now", () => {
    const next = computeNextRun({ frequency: "daily", startDate: "2026-06-01", timeOfDay: "10:00" }, new Date("2026-06-05T15:00:00"));
    expect(next.getDate()).toBe(6);
    expect(next.getHours()).toBe(10);
  });

  it("weekly: keeps the same weekday as startDate", () => {
    const next = computeNextRun({ frequency: "weekly", startDate: "2026-06-01", timeOfDay: "10:00" }, new Date("2026-06-03T00:00:00"));
    expect(next.getDay()).toBe(new Date("2026-06-01T10:00:00").getDay());
    expect(next > new Date("2026-06-03T00:00:00")).toBe(true);
  });

  it("monthly: keeps the same day-of-month", () => {
    const next = computeNextRun({ frequency: "monthly", startDate: "2026-06-15", timeOfDay: "10:00" }, new Date("2026-06-20T00:00:00"));
    expect(next.getDate()).toBe(15);
    expect(next.getMonth()).toBe(6); // July
  });
});
