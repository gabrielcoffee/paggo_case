import { describe, it, expect } from "vitest";
import { normalizeText } from "@/lib/text";

describe("normalizeText", () => {
  it("strips accents", () => {
    expect(normalizeText("São Paulo")).toBe("sao paulo");
  });
  it("treats ç as c", () => {
    expect(normalizeText("AÇAÍ")).toBe("acai");
  });
  it("lowercases and trims", () => {
    expect(normalizeText("  Café ")).toBe("cafe");
  });
  it("handles umlauts", () => {
    expect(normalizeText("Über")).toBe("uber");
  });
  it("makes accented and plain forms equal", () => {
    expect(normalizeText("José")).toBe(normalizeText("JOSE"));
  });
});
