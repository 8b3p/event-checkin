import { describe, expect, it } from "vitest";
import { decideScanOutcome } from "./decideScanOutcome";

describe("decideScanOutcome", () => {
  it("checks a guest in for their full party size when outside", () => {
    expect(decideScanOutcome({ insideSeats: 0, partySeats: 3, direction: "in", seats: 3, override: false })).toEqual({
      outcome: "recorded",
      seats: 3,
      insideSeats: 3,
    });
  });

  it("clamps a check-in to the remaining seats when the requested count is too high", () => {
    expect(decideScanOutcome({ insideSeats: 2, partySeats: 3, direction: "in", seats: 99, override: false })).toEqual({
      outcome: "recorded",
      seats: 1,
      insideSeats: 3,
    });
  });

  it("blocks a check-in when the party is already fully inside, unless overridden", () => {
    expect(decideScanOutcome({ insideSeats: 2, partySeats: 2, direction: "in", seats: 2, override: false })).toEqual({
      outcome: "blocked",
      reason: "already_full",
      insideSeats: 2,
    });

    expect(decideScanOutcome({ insideSeats: 2, partySeats: 2, direction: "in", seats: 2, override: true })).toEqual({
      outcome: "recorded",
      seats: 2,
      insideSeats: 4,
    });
  });

  it("checks a guest out, clamped to the seats currently inside", () => {
    expect(decideScanOutcome({ insideSeats: 3, partySeats: 3, direction: "out", seats: 99, override: false })).toEqual({
      outcome: "recorded",
      seats: 3,
      insideSeats: 0,
    });
  });

  it("blocks a check-out when nobody from the party is inside, unless overridden", () => {
    expect(decideScanOutcome({ insideSeats: 0, partySeats: 2, direction: "out", seats: 1, override: false })).toEqual({
      outcome: "blocked",
      reason: "not_inside",
      insideSeats: 0,
    });

    const overridden = decideScanOutcome({ insideSeats: 0, partySeats: 2, direction: "out", seats: 1, override: true });
    expect(overridden.outcome).toBe("recorded");
  });
});
