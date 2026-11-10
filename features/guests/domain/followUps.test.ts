import { describe, expect, it } from "vitest";
import {
  countByFollowUp,
  countWithoutPhone,
  fillTemplate,
  filterByFollowUp,
  followUpFilterOf,
  phoneNumbersOf,
  templateKindFor,
  type FollowUpGuest,
} from "./followUps";

function guest(overrides: Partial<FollowUpGuest> & { id: number }): FollowUpGuest {
  return {
    name: `ضيف ${overrides.id}`,
    seats: 2,
    phone: null,
    source: "invited",
    status: "no_show",
    peakInsideSeats: 0,
    ...overrides,
  };
}

const GUESTS = [
  guest({ id: 1, status: "full", peakInsideSeats: 2, phone: "0501111111" }),
  guest({ id: 2, status: "partial", peakInsideSeats: 1 }),
  guest({ id: 3, status: "no_show", phone: "0502222222" }),
  guest({ id: 4, status: "no_show" }),
  guest({ id: 5, source: "walk_in", status: "full", peakInsideSeats: 2, phone: "0503333333" }),
];

describe("followUpFilterOf", () => {
  it("puts every walk-in in the walk-in list, whatever their status", () => {
    expect(followUpFilterOf({ source: "walk_in", status: "full" })).toBe("walk_in");
    expect(followUpFilterOf({ source: "walk_in", status: "no_show" })).toBe("walk_in");
  });

  it("splits invited guests by how much of the party ever came", () => {
    expect(followUpFilterOf({ source: "invited", status: "full" })).toBe("attended");
    expect(followUpFilterOf({ source: "invited", status: "partial" })).toBe("partial");
    expect(followUpFilterOf({ source: "invited", status: "no_show" })).toBe("no_show");
  });
});

describe("filterByFollowUp / countByFollowUp", () => {
  it("returns only the guests in each list", () => {
    expect(filterByFollowUp(GUESTS, "attended").map((g) => g.id)).toEqual([1]);
    expect(filterByFollowUp(GUESTS, "partial").map((g) => g.id)).toEqual([2]);
    expect(filterByFollowUp(GUESTS, "no_show").map((g) => g.id)).toEqual([3, 4]);
    expect(filterByFollowUp(GUESTS, "walk_in").map((g) => g.id)).toEqual([5]);
  });

  it("counts add up to the number of guests", () => {
    const counts = countByFollowUp(GUESTS);
    expect(counts).toEqual({ attended: 1, partial: 1, no_show: 2, walk_in: 1 });
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(GUESTS.length);
  });
});

describe("phones", () => {
  it("counts guests without a usable phone", () => {
    expect(countWithoutPhone(GUESTS)).toBe(2);
    expect(countWithoutPhone([{ phone: "  " }, { phone: "abc" }, { phone: "0501234567" }])).toBe(2);
  });

  it("lists each number once, skipping guests without one", () => {
    expect(
      phoneNumbersOf([{ phone: "0501111111" }, { phone: null }, { phone: " 0501111111 " }, { phone: "0502222222" }]),
    ).toEqual(["0501111111", "0502222222"]);
  });
});

describe("templates", () => {
  it("fills every {name}", () => {
    expect(fillTemplate("{name}، شكراً يا {name}", " سارة ")).toBe("سارة، شكراً يا سارة");
  });

  it("uses the 'we missed you' template only for no-shows", () => {
    expect(templateKindFor("no_show")).toBe("missed");
    expect(templateKindFor("attended")).toBe("thanks");
    expect(templateKindFor("partial")).toBe("thanks");
    expect(templateKindFor("walk_in")).toBe("thanks");
  });
});
