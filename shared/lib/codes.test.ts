import { describe, expect, it } from "vitest";
import { generateCode, generateCodes, generateDoorCode, normaliseScan } from "./codes";

describe("generateCode / generateCodes", () => {
  it("generates a 10-character code from the safe alphabet", () => {
    const code = generateCode();
    expect(code).toHaveLength(10);
    expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]+$/);
  });

  it("generateCodes returns the requested count, all unique", () => {
    const codes = generateCodes(50);
    expect(codes).toHaveLength(50);
    expect(new Set(codes).size).toBe(50);
  });
});

describe("generateDoorCode", () => {
  it("generates a shorter, typeable code from the same safe alphabet", () => {
    const code = generateDoorCode();
    expect(code.length).toBeGreaterThanOrEqual(4);
    expect(code.length).toBeLessThanOrEqual(6);
    expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]+$/);
  });
});

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
});
