import { describe, expect, it } from "vitest";
import { normaliseScan } from "./code-format";

describe("normaliseScan", () => {
  it("accepts a bare code in any case", () => {
    expect(normaliseScan("abc23456j9")).toBe("ABC23456J9");
  });

  it("extracts the code from a full invite URL", () => {
    expect(normaliseScan("https://example.com/i/ABC23456J9")).toBe("ABC23456J9");
  });

  it("rejects the wrong length", () => {
    expect(normaliseScan("ABC")).toBeNull();
  });

  it("rejects a URL that isn't an invite link, e.g. a venue map link", () => {
    expect(normaliseScan("https://maps.example.com/?q=Grand+Hall")).toBeNull();
  });

  it("rejects empty or whitespace-only input", () => {
    expect(normaliseScan("")).toBeNull();
    expect(normaliseScan("   ")).toBeNull();
  });
});
