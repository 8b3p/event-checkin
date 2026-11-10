import { describe, expect, it } from "vitest";
import { generateShareToken, isWellFormedShareToken, shareTokensMatch } from "./share-token";

describe("share tokens", () => {
  it("carries 192 bits as 32 URL-safe characters", () => {
    const token = generateShareToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(isWellFormedShareToken(token)).toBe(true);
  });

  it("does not repeat", () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateShareToken));
    expect(tokens.size).toBe(1000);
  });

  it("rejects anything that is not the right shape", () => {
    expect(isWellFormedShareToken("")).toBe(false);
    expect(isWellFormedShareToken("short")).toBe(false);
    expect(isWellFormedShareToken(`${generateShareToken()}x`)).toBe(false);
    expect(isWellFormedShareToken(`${generateShareToken().slice(0, 31)}!`)).toBe(false);
    expect(isWellFormedShareToken(`${generateShareToken().slice(0, 31)}\n`)).toBe(false);
  });

  it("compares tokens exactly", () => {
    const token = generateShareToken();
    expect(shareTokensMatch(token, token)).toBe(true);
    expect(shareTokensMatch(token, generateShareToken())).toBe(false);
    expect(shareTokensMatch(token, token.slice(0, 31))).toBe(false);
  });
});
