import { describe, expect, it } from "vitest";
import { internationalDigits, phoneDigits, phoneKey, whatsappUrl } from "./phone";

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

describe("internationalDigits", () => {
  it("turns a local Syrian 09… number into 963 9…", () => {
    expect(internationalDigits("0931110001")).toBe("963931110001");
    expect(internationalDigits("093 111 0001")).toBe("963931110001");
    expect(internationalDigits("٠٩٣١١١٠٠٠١")).toBe("963931110001");
  });

  it("adds 963 to a mobile written without its leading 0", () => {
    expect(internationalDigits("931110001")).toBe("963931110001");
  });

  it("leaves numbers that already carry a country code alone", () => {
    expect(internationalDigits("+963 93 111 0001")).toBe("963931110001");
    expect(internationalDigits("00963931110001")).toBe("963931110001");
    expect(internationalDigits("+971 50 123 4567")).toBe("971501234567");
  });

  it("is empty without a number", () => {
    expect(internationalDigits(null)).toBe("");
  });
});

describe("whatsappUrl with local numbers", () => {
  it("links a local 09… number to its +963 chat", () => {
    expect(whatsappUrl("0931110001", "x")).toBe("https://wa.me/963931110001?text=x");
  });
});

describe("phoneKey across formats", () => {
  it("matches a Syrian number written locally and internationally", () => {
    expect(phoneKey("0931110001")).toBe(phoneKey("+963 931 110 001"));
  });
});
