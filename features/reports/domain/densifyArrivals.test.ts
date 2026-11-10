import { describe, expect, it } from "vitest";
import { densifyArrivals, peakArrival } from "./densifyArrivals";

describe("densifyArrivals", () => {
  it("fills empty 15-minute blocks between the first and last arrival", () => {
    const filled = densifyArrivals([
      { minute: "2026-11-10T18:00:00.000Z", seats: 4 },
      { minute: "2026-11-10T18:45:00.000Z", seats: 2 },
    ]);

    expect(filled).toEqual([
      { minute: "2026-11-10T18:00:00.000Z", seats: 4 },
      { minute: "2026-11-10T18:15:00.000Z", seats: 0 },
      { minute: "2026-11-10T18:30:00.000Z", seats: 0 },
      { minute: "2026-11-10T18:45:00.000Z", seats: 2 },
    ]);
  });

  it("returns nothing for no arrivals", () => {
    expect(densifyArrivals([])).toEqual([]);
  });

  it("caps a runaway range at 12 hours of blocks", () => {
    const filled = densifyArrivals([
      { minute: "2026-11-10T00:00:00.000Z", seats: 1 },
      { minute: "2026-11-12T00:00:00.000Z", seats: 1 },
    ]);
    expect(filled).toHaveLength(48);
  });
});

describe("peakArrival", () => {
  it("picks the busiest block, earliest on a tie", () => {
    expect(
      peakArrival([
        { minute: "a", seats: 3 },
        { minute: "b", seats: 7 },
        { minute: "c", seats: 7 },
      ]),
    ).toEqual({ minute: "b", seats: 7 });
  });

  it("is null when nobody arrived", () => {
    expect(peakArrival([])).toBeNull();
  });
});
