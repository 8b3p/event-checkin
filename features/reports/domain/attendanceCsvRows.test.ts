import { describe, expect, it } from "vitest";
import type { GuestAttendanceRow } from "@/features/check-in/domain/ScanEvent";
import { attendanceCsvRows, resolveTimeZone } from "./attendanceCsvRows";

const came: GuestAttendanceRow = {
  id: 1,
  name: "سارة",
  seats: 3,
  phone: "0500000000",
  note: null,
  code: "ABCDEFGH",
  source: "invited",
  insideSeats: 1,
  firstInAt: new Date("2026-11-10T16:05:00Z"),
  lastOutAt: new Date("2026-11-10T19:40:00Z"),
  peakInsideSeats: 2,
  status: "partial",
};

describe("attendanceCsvRows", () => {
  it("writes times in the owner's timezone and labels the status", () => {
    const [header, row] = attendanceCsvRows([came], "Asia/Riyadh");

    expect(header[0]).toBe("الاسم");
    expect(row).toEqual([
      "سارة",
      "مدعو",
      "3",
      "2",
      "حضر جزئياً",
      "2026-11-10 19:05",
      "2026-11-10 22:40",
      "1",
      "0500000000",
      "",
      "ABCDEFGH",
    ]);
  });

  it("leaves times blank for a no-show", () => {
    const [, row] = attendanceCsvRows(
      [{ ...came, firstInAt: null, lastOutAt: null, peakInsideSeats: 0, insideSeats: 0, status: "no_show" }],
      "UTC",
    );
    expect(row.slice(3, 8)).toEqual(["0", "لم يحضر", "", "", ""]);
  });
});

describe("resolveTimeZone", () => {
  it("keeps a real IANA zone and falls back to UTC otherwise", () => {
    expect(resolveTimeZone("Asia/Riyadh")).toBe("Asia/Riyadh");
    expect(resolveTimeZone("Not/AZone")).toBe("UTC");
    expect(resolveTimeZone(null)).toBe("UTC");
  });
});
