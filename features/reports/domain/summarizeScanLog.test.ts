import { describe, expect, it } from "vitest";
import type { EventScan } from "@/features/check-in/domain/ScanEvent";
import { filterScanLog, summarizeScanLog } from "./summarizeScanLog";

let nextId = 1;
function scan(overrides: Partial<EventScan>): EventScan {
  return {
    id: nextId++,
    guestId: 1,
    guestName: "Sara",
    direction: "in",
    method: "qr",
    seats: 1,
    at: new Date("2026-11-10T18:00:00Z"),
    scannedBy: "door",
    override: false,
    ...overrides,
  };
}

const log = [
  scan({}),
  scan({ method: "manual" }),
  scan({ override: true }),
  scan({ direction: "out", method: "manual" }),
];

describe("summarizeScanLog", () => {
  it("counts directions, overrides and manual entries", () => {
    expect(summarizeScanLog(log)).toEqual({ total: 4, checkIns: 3, checkOuts: 1, overrides: 1, manual: 2 });
  });
});

describe("filterScanLog", () => {
  it("narrows to the chosen kind of scan", () => {
    expect(filterScanLog(log, "all")).toHaveLength(4);
    expect(filterScanLog(log, "overrides")).toHaveLength(1);
    expect(filterScanLog(log, "manual")).toHaveLength(2);
    expect(filterScanLog(log, "out")).toHaveLength(1);
  });
});
