import { describe, expect, it } from "vitest";
import { replayOccupancy, type OccupancyScan } from "./replayOccupancy";

const at = (time: string) => new Date(`2026-11-10T${time}:00Z`);
const scan = (direction: "in" | "out", seats: number, time: string): OccupancyScan => ({
  direction,
  seats,
  at: at(time),
});

describe("replayOccupancy", () => {
  it("returns an empty replay for no scans", () => {
    expect(replayOccupancy([], 100)).toEqual({
      points: [],
      peak: null,
      capacity: 100,
      overCapacity: null,
      stillInside: 0,
    });
  });

  it("adds seats on in, subtracts on out, in time order regardless of input order", () => {
    const replay = replayOccupancy([scan("out", 2, "20:00"), scan("in", 2, "18:00"), scan("in", 3, "19:00")], null);

    expect(replay.points.map((point) => point.inside)).toEqual([2, 5, 3]);
    expect(replay.points.map((point) => point.at)).toEqual([at("18:00"), at("19:00"), at("20:00")]);
    expect(replay.stillInside).toBe(3);
  });

  it("reports the peak headcount and the first moment it was reached", () => {
    const replay = replayOccupancy(
      [scan("in", 4, "18:00"), scan("in", 4, "19:00"), scan("out", 4, "20:00"), scan("in", 4, "21:00")],
      null,
    );

    expect(replay.peak).toEqual({ inside: 8, at: at("19:00") });
  });

  it("collapses scans at the same instant into one point, applying arrivals before departures", () => {
    const replay = replayOccupancy([scan("out", 2, "19:00"), scan("in", 2, "18:00"), scan("in", 3, "19:00")], null);

    expect(replay.points.map((point) => point.inside)).toEqual([2, 3]);
    expect(replay.peak?.inside).toBe(3);
  });

  it("never reports a negative headcount from stray out-scans", () => {
    const replay = replayOccupancy([scan("out", 3, "18:00"), scan("in", 2, "18:30")], null);

    expect(replay.points.map((point) => point.inside)).toEqual([0, 2]);
  });

  it("has no over-capacity block when no capacity is set", () => {
    expect(replayOccupancy([scan("in", 500, "18:00")], null).overCapacity).toBeNull();
  });

  it("has no over-capacity block when headcount only reaches capacity", () => {
    expect(replayOccupancy([scan("in", 100, "18:00"), scan("out", 100, "20:00")], 100).overCapacity).toBeNull();
  });

  it("totals the minutes spent above capacity and remembers the first crossing and the worst excess", () => {
    const replay = replayOccupancy(
      [
        scan("in", 90, "18:00"),
        scan("in", 20, "19:00"), // 110 > 100: over from 19:00
        scan("in", 10, "19:30"), // 120
        scan("out", 30, "20:00"), // 90: back under after 60 minutes
        scan("in", 15, "21:00"), // 105: over again
        scan("out", 15, "21:30"), // 90: another 30 minutes
      ],
      100,
    );

    expect(replay.overCapacity).toEqual({
      firstAt: at("19:00"),
      minutes: 90,
      peakExcess: 20,
      stillOverAtEnd: false,
    });
  });

  it("flags headcount still over capacity at the last scan, without inventing time past it", () => {
    const replay = replayOccupancy([scan("in", 90, "18:00"), scan("in", 30, "19:00"), scan("in", 5, "19:45")], 100);

    expect(replay.overCapacity).toEqual({
      firstAt: at("19:00"),
      minutes: 45,
      peakExcess: 25,
      stillOverAtEnd: true,
    });
  });

  it("treats parties never scanned out as still inside — headcount is an upper bound", () => {
    const replay = replayOccupancy([scan("in", 4, "18:00"), scan("in", 2, "18:10"), scan("out", 2, "22:00")], null);

    expect(replay.stillInside).toBe(4);
    expect(replay.points[replay.points.length - 1].inside).toBe(4);
  });
});
