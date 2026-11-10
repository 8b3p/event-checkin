import { describe, expect, it } from "vitest";
import { attendanceStatus, foldGuestAttendance, type ScanForAttendance } from "./foldGuestAttendance";

function scan(overrides: Partial<Omit<ScanForAttendance, "at">> & { at: string }): ScanForAttendance {
  return { guestId: 1, direction: "in", seats: 1, ...overrides, at: new Date(overrides.at) };
}

describe("foldGuestAttendance", () => {
  it("records first arrival, last departure and the current balance", () => {
    const result = foldGuestAttendance([
      scan({ at: "2026-11-10T18:00:00Z", seats: 3 }),
      scan({ at: "2026-11-10T21:30:00Z", direction: "out", seats: 3 }),
    ]);

    expect(result.get(1)).toEqual({
      firstInAt: new Date("2026-11-10T18:00:00Z"),
      lastOutAt: new Date("2026-11-10T21:30:00Z"),
      peakInsideSeats: 3,
      insideSeats: 0,
    });
  });

  it("takes the peak, not the sum, when someone steps out and back in", () => {
    const result = foldGuestAttendance([
      scan({ at: "2026-11-10T18:00:00Z", seats: 2 }),
      scan({ at: "2026-11-10T19:00:00Z", direction: "out", seats: 1 }),
      scan({ at: "2026-11-10T19:10:00Z", seats: 1 }),
    ]);

    expect(result.get(1)?.peakInsideSeats).toBe(2);
    expect(result.get(1)?.insideSeats).toBe(2);
  });

  it("replays out-of-order input in time order", () => {
    const result = foldGuestAttendance([
      scan({ at: "2026-11-10T19:00:00Z", direction: "out", seats: 2 }),
      scan({ at: "2026-11-10T18:00:00Z", seats: 2 }),
    ]);

    expect(result.get(1)?.firstInAt).toEqual(new Date("2026-11-10T18:00:00Z"));
    expect(result.get(1)?.peakInsideSeats).toBe(2);
  });

  it("keeps guests apart", () => {
    const result = foldGuestAttendance([
      scan({ guestId: 1, at: "2026-11-10T18:00:00Z", seats: 2 }),
      scan({ guestId: 2, at: "2026-11-10T18:05:00Z", seats: 4 }),
    ]);

    expect(result.get(1)?.peakInsideSeats).toBe(2);
    expect(result.get(2)?.peakInsideSeats).toBe(4);
  });
});

describe("attendanceStatus", () => {
  it("is a no-show with no scans at all", () => {
    expect(attendanceStatus(2, undefined)).toBe("no_show");
  });

  it("is partial when fewer came than were invited", () => {
    const [attendance] = foldGuestAttendance([scan({ at: "2026-11-10T18:00:00Z", seats: 1 })]).values();
    expect(attendanceStatus(3, attendance)).toBe("partial");
  });

  it("is full when the whole party came, even if they have since left", () => {
    const [attendance] = foldGuestAttendance([
      scan({ at: "2026-11-10T18:00:00Z", seats: 3 }),
      scan({ at: "2026-11-10T22:00:00Z", direction: "out", seats: 3 }),
    ]).values();
    expect(attendanceStatus(3, attendance)).toBe("full");
  });
});
