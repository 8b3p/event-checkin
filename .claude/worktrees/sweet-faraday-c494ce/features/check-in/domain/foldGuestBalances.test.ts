import { describe, expect, it } from "vitest";
import { foldGuestBalances } from "./foldGuestBalances";

describe("foldGuestBalances", () => {
  it("a single check-in leaves the guest inside", () => {
    const result = foldGuestBalances([{ guestId: 1, direction: "in", seats: 4 }]);
    expect(result.get(1)).toBe(4);
  });

  it("check-in then full check-out nets to zero (outside)", () => {
    const result = foldGuestBalances([
      { guestId: 1, direction: "in", seats: 4 },
      { guestId: 1, direction: "out", seats: 4 },
    ]);
    expect(result.get(1)).toBe(0);
  });

  it("a partial check-out leaves the remaining seats inside", () => {
    const result = foldGuestBalances([
      { guestId: 1, direction: "in", seats: 4 },
      { guestId: 1, direction: "out", seats: 1 },
    ]);
    expect(result.get(1)).toBe(3);
  });

  it("re-entry after a full exit is additive, not a reset", () => {
    const result = foldGuestBalances([
      { guestId: 1, direction: "in", seats: 2 },
      { guestId: 1, direction: "out", seats: 2 },
      { guestId: 1, direction: "in", seats: 2 },
    ]);
    expect(result.get(1)).toBe(2);
  });

  it("keeps separate balances per guest", () => {
    const result = foldGuestBalances([
      { guestId: 1, direction: "in", seats: 4 },
      { guestId: 2, direction: "in", seats: 1 },
      { guestId: 1, direction: "out", seats: 4 },
    ]);
    expect(result.get(1)).toBe(0);
    expect(result.get(2)).toBe(1);
  });

  it("an unknown guest has no entry, not zero", () => {
    const result = foldGuestBalances([]);
    expect(result.has(1)).toBe(false);
  });

  it("a check-out exceeding accumulated check-ins produces a negative balance (no floor at zero)", () => {
    const result = foldGuestBalances([
      { guestId: 1, direction: "in", seats: 2 },
      { guestId: 1, direction: "out", seats: 5 },
    ]);
    expect(result.get(1)).toBe(-3);
  });
});
