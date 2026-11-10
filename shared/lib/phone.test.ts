import { describe, expect, it } from "vitest";
import { phoneDigits, phoneKey, whatsappUrl } from "./phone";

describe("phoneDigits", () => {
  it("keeps digits only and drops a leading 00", () => {
    expect(phoneDigits("+971 50-123 4567")).toBe("971501234567");
    expect(phoneDigits("00971501234567")).toBe("971501234567");
  });

  it("folds Arabic-Indic digits", () => {
    expect(phoneDigits("٠٥٠١٢٣٤٥٦٧")).toBe("0501234567");
  });

  it("is empty for null, undefined and non-numeric input", () => {
    expect(phoneDigits(null)).toBe("");
    expect(phoneDigits(undefined)).toBe("");
    expect(phoneDigits("n/a")).toBe("");
  });
});

describe("phoneKey", () => {
  it("matches the same number with and without a country code", () => {
    expect(phoneKey("0501234567")).toBe(phoneKey("+971 50 123 4567"));
    expect(phoneKey("٠٥٠١٢٣٤٥٦٧")).toBe(phoneKey("0501234567"));
  });

  it("does not match different numbers", () => {
    expect(phoneKey("0501234567")).not.toBe(phoneKey("0501234568"));
  });

  it("is empty for numbers too short to compare", () => {
    expect(phoneKey("123")).toBe("");
    expect(phoneKey("")).toBe("");
    expect(phoneKey(null)).toBe("");
  });
});

describe("whatsappUrl", () => {
  it("builds a wa.me link with an encoded message", () => {
    expect(whatsappUrl("+971 50 123 4567", "شكراً يا سارة")).toBe(
      `https://wa.me/971501234567?text=${encodeURIComponent("شكراً يا سارة")}`,
    );
  });

  it("returns null without a usable number", () => {
    expect(whatsappUrl(null, "x")).toBeNull();
    expect(whatsappUrl("abc", "x")).toBeNull();
  });
});
