import { describe, expect, it } from "vitest";
import type { GuestAttendanceRow } from "@/features/check-in/domain/ScanEvent";
import { summarizeAttendance } from "./summarizeAttendance";

let nextId = 1;
function row(overrides: Partial<GuestAttendanceRow>): GuestAttendanceRow {
  const id = nextId++;
  return {
    id,
    name: `Guest ${id}`,
    seats: 2,
    phone: null,
    note: null,
    code: `CODE${id}`,
    source: "invited",
    insideSeats: 0,
    firstInAt: null,
    lastOutAt: null,
    peakInsideSeats: 0,
    status: "no_show",
    ...overrides,
  };
}

const at = (time: string) => new Date(`2026-11-10T${time}:00Z`);

describe("summarizeAttendance", () => {
  it("returns zeros and a null turnout for an empty event", () => {
    const summary = summarizeAttendance([]);
    expect(summary.invitedGuests).toBe(0);
    expect(summary.turnout).toBeNull();
    expect(summary.firstArrivalAt).toBeNull();
  });

  it("splits invitations into full, partial and no-show", () => {
    const summary = summarizeAttendance([
      row({ seats: 4, peakInsideSeats: 4, status: "full", firstInAt: at("18:00") }),
      row({ seats: 3, peakInsideSeats: 1, status: "partial", firstInAt: at("19:30") }),
      row({ seats: 2 }),
    ]);

    expect(summary).toMatchObject({
      invitedGuests: 3,
      invitedSeats: 9,
      arrivedGuests: 2,
      arrivedSeats: 5,
      fullGuests: 1,
      partialGuests: 1,
      missingSeats: 2,
      noShowGuests: 1,
      noShowSeats: 2,
      firstArrivalAt: at("18:00"),
      lastArrivalAt: at("19:30"),
    });
    expect(summary.turnout).toBeCloseTo(5 / 9);
  });

  it("counts override extras separately so they don't push turnout past 100%", () => {
    const summary = summarizeAttendance([row({ seats: 2, peakInsideSeats: 3, status: "full", firstInAt: at("18:00") })]);

    expect(summary.arrivedSeats).toBe(2);
    expect(summary.extraSeats).toBe(1);
    expect(summary.turnout).toBe(1);
    expect(summary.peopleThroughDoor).toBe(3);
  });

  it("keeps walk-ins out of the invited numbers but in the door total", () => {
    const summary = summarizeAttendance([
      row({ seats: 2, peakInsideSeats: 2, status: "full", firstInAt: at("18:00") }),
      row({ source: "walk_in", seats: 3, peakInsideSeats: 3, insideSeats: 3, status: "full", firstInAt: at("20:00") }),
    ]);

    expect(summary.invitedGuests).toBe(1);
    expect(summary.walkInGuests).toBe(1);
    expect(summary.walkInSeats).toBe(3);
    expect(summary.peopleThroughDoor).toBe(5);
    expect(summary.stillInsideGuests).toBe(1);
    expect(summary.lastArrivalAt).toEqual(at("20:00"));
  });
});
