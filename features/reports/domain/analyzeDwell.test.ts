import { describe, expect, it } from "vitest";
import { analyzeDwell, EARLY_LEAVER_MINUTES, type DwellGuest } from "./analyzeDwell";

const at = (time: string) => new Date(`2026-11-10T${time}:00Z`);
let nextId = 1;
function guest(overrides: Partial<DwellGuest>): DwellGuest {
  const id = nextId++;
  return {
    id,
    name: `Guest ${id}`,
    peakInsideSeats: 2,
    insideSeats: 0,
    firstInAt: null,
    lastOutAt: null,
    ...overrides,
  };
}

describe("analyzeDwell", () => {
  it("reports nothing for an event with no check-outs", () => {
    const dwell = analyzeDwell([guest({ firstInAt: at("18:00"), insideSeats: 2 }), guest({})], at("23:00"));

    expect(dwell).toMatchObject({ measuredParties: 0, arrivedParties: 1, averageMinutes: null, medianMinutes: null });
    expect(dwell.shortest).toBeNull();
    expect(dwell.longest).toBeNull();
    expect(dwell.earlyLeavers).toEqual([]);
  });

  it("measures first-in to final check-out and ignores parties never fully checked out", () => {
    const dwell = analyzeDwell(
      [
        guest({ name: "A", firstInAt: at("18:00"), lastOutAt: at("20:00") }), // 120
        guest({ name: "B", firstInAt: at("18:30"), lastOutAt: at("22:30") }), // 240
        guest({ name: "C", firstInAt: at("19:00"), lastOutAt: at("19:30"), insideSeats: 1 }), // only partly out
        guest({ name: "D", firstInAt: at("19:00"), insideSeats: 2 }), // never out
        guest({ name: "E" }), // no-show
      ],
      at("23:00"),
    );

    expect(dwell.arrivedParties).toBe(4);
    expect(dwell.measuredParties).toBe(2);
    expect(dwell.averageMinutes).toBe(180);
    expect(dwell.medianMinutes).toBe(180);
    expect(dwell.shortest).toEqual({ name: "A", minutes: 120 });
    expect(dwell.longest).toEqual({ name: "B", minutes: 240 });
  });

  it("takes the middle value as the median, which differs from the mean on skewed stays", () => {
    const dwell = analyzeDwell(
      [
        guest({ firstInAt: at("18:00"), lastOutAt: at("18:30") }), // 30
        guest({ firstInAt: at("18:00"), lastOutAt: at("19:00") }), // 60
        guest({ firstInAt: at("18:00"), lastOutAt: at("23:00") }), // 300
      ],
      at("23:00"),
    );

    expect(dwell.medianMinutes).toBe(60);
    expect(dwell.averageMinutes).toBe(130);
  });

  it("flags parties who left more than the threshold before the last scan, earliest leaver first", () => {
    expect(EARLY_LEAVER_MINUTES).toBe(60);
    const dwell = analyzeDwell(
      [
        guest({ name: "late", firstInAt: at("18:00"), lastOutAt: at("23:00") }),
        guest({ name: "borderline", firstInAt: at("18:00"), lastOutAt: at("22:00") }), // exactly 60 before: not early
        guest({ name: "early", firstInAt: at("18:00"), lastOutAt: at("21:59") }), // 61 before
        guest({ name: "earliest", firstInAt: at("18:00"), lastOutAt: at("20:00"), peakInsideSeats: 4 }),
      ],
      at("23:00"),
    );

    expect(dwell.earlyLeavers.map((leaver) => leaver.name)).toEqual(["earliest", "early"]);
    expect(dwell.earlyLeavers[0]).toMatchObject({
      seats: 4,
      stayMinutes: 120,
      minutesBeforeEnd: 180,
      leftAt: at("20:00"),
    });
  });

  it("does not count someone who stepped out and came back as having left early", () => {
    const dwell = analyzeDwell(
      [guest({ firstInAt: at("18:00"), lastOutAt: at("19:00"), insideSeats: 2 })],
      at("23:00"),
    );

    expect(dwell.earlyLeavers).toEqual([]);
    expect(dwell.measuredParties).toBe(0);
  });

  it("has no early leavers when the night is shorter than the threshold", () => {
    const dwell = analyzeDwell([guest({ firstInAt: at("18:00"), lastOutAt: at("18:20") })], at("18:40"));

    expect(dwell.measuredParties).toBe(1);
    expect(dwell.earlyLeavers).toEqual([]);
  });

  it("accepts a different threshold", () => {
    const dwell = analyzeDwell([guest({ firstInAt: at("18:00"), lastOutAt: at("22:00") })], at("23:00"), 30);

    expect(dwell.earlyLeavers).toHaveLength(1);
  });
});
