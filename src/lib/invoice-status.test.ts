import { describe, it, expect } from "vitest";
import { canTransition } from "@/lib/invoice-status";

describe("canTransition", () => {
  it("allows open → in_negotiation", () => {
    expect(canTransition("open", "in_negotiation")).toBe(true);
  });
  it("allows the agreement_signed → paid happy path", () => {
    expect(canTransition("agreement_signed", "paid")).toBe(true);
  });
  it("allows reopening a dispute into negotiation", () => {
    expect(canTransition("disputed", "in_negotiation")).toBe(true);
  });
  it("allows any change between distinct statuses (mis-click recovery)", () => {
    expect(canTransition("open", "agreement_signed")).toBe(true);
    expect(canTransition("paid", "open")).toBe(true);
    expect(canTransition("paid", "in_negotiation")).toBe(true);
    expect(canTransition("written_off", "open")).toBe(true);
  });
  it("rejects a no-op change to the same status", () => {
    expect(canTransition("paid", "paid")).toBe(false);
    expect(canTransition("open", "open")).toBe(false);
  });
});
