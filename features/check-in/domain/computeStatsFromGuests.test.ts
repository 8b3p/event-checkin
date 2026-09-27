import { describe, expect, it } from "vitest";
import { computeStatsFromGuests } from "./computeStatsFromGuests";
import type { GuestWithStatus } from "./ScanEvent";

function guest(overrides: Partial<GuestWithStatus>): GuestWithStatus {
  return {
    id: 1,
    name: "Guest",
    seats: 1,
    phone: null,
    note: null,
    code: "X",
    source: "invited",
    insideSeats: 0,
    ...overrides,
  };
}

describe("computeStatsFromGuests", () => {
  it("returns zeros for an empty guest list", () => {
    expect(computeStatsFromGuests([])).toEqual({ invites: 0, seatsInvited: 0, guestsInside: 0, seatsInside: 0 });
  });

  it("counts invites/seats invited regardless of status", () => {
    const guests = [guest({ id: 1, seats: 2 }), guest({ id: 2, seats: 3 })];
    expect(computeStatsFromGuests(guests)).toMatchObject({ invites: 2, seatsInvited: 5 });
  });

  it("counts a guest as inside only when insideSeats is greater than zero", () => {
    const guests = [
      guest({ id: 1, seats: 3, insideSeats: 2 }),
      guest({ id: 2, seats: 2, insideSeats: 0 }),
    ];
    expect(computeStatsFromGuests(guests)).toEqual({
      invites: 2,
      seatsInvited: 5,
      guestsInside: 1,
      seatsInside: 2,
    });
  });

  it("never lets a negative insideSeats reduce seatsInside below the sum of valid balances", () => {
    // A negative balance would only arise from a data bug, but stats must
    // never go negative because of one — clamp rather than propagate it.
    const guests = [guest({ id: 1, seats: 2, insideSeats: -1 }), guest({ id: 2, seats: 2, insideSeats: 2 })];
    expect(computeStatsFromGuests(guests)).toEqual({
      invites: 2,
      seatsInvited: 4,
      guestsInside: 1,
      seatsInside: 2,
    });
  });
});
