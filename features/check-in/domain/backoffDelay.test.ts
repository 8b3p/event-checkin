import { describe, expect, it } from "vitest";
import { nextBackoffDelayMs } from "./backoffDelay";

describe("nextBackoffDelayMs", () => {
  it("starts at 2s for the first attempt", () => {
    expect(nextBackoffDelayMs(1)).toBe(2000);
  });

  it("doubles each attempt", () => {
    expect(nextBackoffDelayMs(2)).toBe(4000);
    expect(nextBackoffDelayMs(3)).toBe(8000);
    expect(nextBackoffDelayMs(4)).toBe(16000);
  });

  it("caps at 60s no matter how many attempts", () => {
    expect(nextBackoffDelayMs(10)).toBe(60_000);
    expect(nextBackoffDelayMs(100)).toBe(60_000);
  });

  it("treats a zero/negative attempt as the base delay", () => {
    expect(nextBackoffDelayMs(0)).toBe(2000);
    expect(nextBackoffDelayMs(-1)).toBe(2000);
  });
});
