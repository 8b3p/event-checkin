import { describe, expect, it } from "vitest";
import type { IScanRepository } from "@/features/check-in/domain/IScanRepository";
import type { ArrivalBucket, EventScan, GuestAttendanceRow } from "@/features/check-in/domain/ScanEvent";
import type { Event } from "@/features/events/domain/Event";
import type { IEventRepository } from "@/features/events/domain/IEventRepository";
import { GetEventReportUseCase } from "./GetEventReportUseCase";

const EVENT: Event = {
  id: 7,
  name: "Layla & Omar",
  eventDate: "2026-11-10",
  venue: null,
  locationLink: null,
  description: null,
  doorCode: "PALM1",
  capacity: 120,
  status: "live",
  createdAt: new Date("2026-10-01T00:00:00Z"),
};

class FakeEvents implements Pick<IEventRepository, "getById"> {
  async getById(id: number): Promise<Event | null> {
    return id === EVENT.id ? EVENT : null;
  }
}

class FakeScans implements Pick<IScanRepository, "listGuestAttendance" | "listScansForEvent" | "arrivalBuckets"> {
  guests: GuestAttendanceRow[] = [];
  scans: EventScan[] = [];
  buckets: ArrivalBucket[] = [];
  async listGuestAttendance(): Promise<GuestAttendanceRow[]> {
    return this.guests;
  }
  async listScansForEvent(): Promise<EventScan[]> {
    return this.scans;
  }
  async arrivalBuckets(): Promise<ArrivalBucket[]> {
    return this.buckets;
  }
}

describe("GetEventReportUseCase", () => {
  it("returns null for an unknown event", async () => {
    expect(await new GetEventReportUseCase(new FakeEvents(), new FakeScans()).execute(99)).toBeNull();
  });

  it("assembles summary, filled-in arrivals, peak and scan log counts", async () => {
    const scans = new FakeScans();
    scans.guests = [
      {
        id: 1,
        name: "Sara",
        seats: 2,
        phone: null,
        note: null,
        code: "AAAAAAAA",
        source: "invited",
        insideSeats: 0,
        firstInAt: new Date("2026-11-10T18:00:00Z"),
        lastOutAt: new Date("2026-11-10T22:00:00Z"),
        peakInsideSeats: 2,
        status: "full",
      },
    ];
    scans.scans = [
      { id: 1, guestId: 1, guestName: "Sara", direction: "in", method: "qr", seats: 2, at: new Date("2026-11-10T18:00:00Z"), scannedBy: "door", override: false },
      { id: 2, guestId: 1, guestName: "Sara", direction: "out", method: "manual", seats: 2, at: new Date("2026-11-10T22:00:00Z"), scannedBy: "door", override: false },
    ];
    scans.buckets = [
      { minute: "2026-11-10T18:00:00.000Z", seats: 2 },
      { minute: "2026-11-10T18:30:00.000Z", seats: 5 },
    ];

    const report = await new GetEventReportUseCase(new FakeEvents(), scans).execute(EVENT.id);

    expect(report?.event.id).toBe(EVENT.id);
    expect(report?.summary.turnout).toBe(1);
    expect(report?.arrivals).toHaveLength(3);
    expect(report?.peak).toEqual({ minute: "2026-11-10T18:30:00.000Z", seats: 5 });
    expect(report?.scanSummary).toMatchObject({ total: 2, checkOuts: 1, manual: 1 });
  });
});
