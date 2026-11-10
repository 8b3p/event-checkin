import { describe, expect, it } from "vitest";
import type { IScanRepository } from "@/features/check-in/domain/IScanRepository";
import type { ArrivalBucket, EventScan, GuestAttendanceRow } from "@/features/check-in/domain/ScanEvent";
import type { Event } from "@/features/events/domain/Event";
import type { IEventRepository } from "@/features/events/domain/IEventRepository";
import { generateShareToken } from "@/shared/lib/share-token";
import type { IReportShareRepository } from "../IReportShareRepository";
import type { ReportShare } from "../ReportShare";
import {
  CreateReportShareUseCase,
  GetSharedReportUseCase,
  RevokeReportShareUseCase,
  SetReportShareNamesUseCase,
} from "./ReportShareUseCases";

const EVENT: Event = {
  id: 7,
  name: "Layla & Omar",
  eventDate: "2026-11-10",
  venue: "The Palm Hall",
  locationLink: "https://maps.example/secret-place",
  description: "Private family note",
  doorCode: "PALM1",
  capacity: 120,
  status: "live",
  createdAt: new Date("2026-10-01T00:00:00Z"),
};

const at = (time: string) => new Date(`2026-11-10T${time}:00Z`);

class FakeShares implements IReportShareRepository {
  byEvent = new Map<number, ReportShare>();
  async getByEventId(eventId: number) {
    return this.byEvent.get(eventId) ?? null;
  }
  async getByToken(token: string) {
    for (const [eventId, share] of this.byEvent) if (share.token === token) return { eventId, share };
    return null;
  }
  async create(eventId: number, token: string) {
    if (eventId !== EVENT.id) return null;
    if (!this.byEvent.has(eventId)) this.byEvent.set(eventId, { token, sharedAt: new Date(), showNames: false });
    return this.byEvent.get(eventId)!;
  }
  async setShowNames(eventId: number, showNames: boolean) {
    const share = this.byEvent.get(eventId);
    if (share) share.showNames = showNames;
  }
  async revoke(eventId: number) {
    this.byEvent.delete(eventId);
  }
}

class FakeEvents implements Pick<IEventRepository, "getById"> {
  async getById(id: number) {
    return id === EVENT.id ? EVENT : null;
  }
}

class FakeScans implements Pick<IScanRepository, "listGuestAttendance" | "listScansForEvent" | "arrivalBuckets"> {
  async listGuestAttendance(): Promise<GuestAttendanceRow[]> {
    return [
      {
        id: 1,
        name: "Sara Ahmed",
        seats: 2,
        phone: "0501234567",
        note: "Allergic to nuts",
        code: "SECRETCODE",
        source: "invited",
        insideSeats: 0,
        firstInAt: at("18:00"),
        lastOutAt: at("19:00"),
        peakInsideSeats: 2,
        status: "full",
      },
    ];
  }
  async listScansForEvent(): Promise<EventScan[]> {
    return [
      { id: 1, guestId: 1, guestName: "Sara Ahmed", direction: "in", method: "qr", seats: 2, at: at("18:00"), scannedBy: "door", override: false },
      { id: 2, guestId: 1, guestName: "Sara Ahmed", direction: "out", method: "qr", seats: 2, at: at("19:00"), scannedBy: "door", override: false },
      { id: 3, guestId: 2, guestName: "Late One", direction: "in", method: "qr", seats: 1, at: at("22:00"), scannedBy: "door", override: false },
    ];
  }
  async arrivalBuckets(): Promise<ArrivalBucket[]> {
    return [{ minute: "2026-11-10T18:00:00.000Z", seats: 2 }];
  }
}

const sharedReport = (shares: FakeShares, token: string) =>
  new GetSharedReportUseCase(shares, new FakeEvents(), new FakeScans()).execute(token);

describe("CreateReportShareUseCase", () => {
  it("creates a share with a fresh token and keeps it on a second call", async () => {
    const shares = new FakeShares();
    const first = await new CreateReportShareUseCase(shares).execute(EVENT.id);
    const second = await new CreateReportShareUseCase(shares).execute(EVENT.id);

    expect(first.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(second.token).toBe(first.token);
  });

  it("rejects an event that does not exist", async () => {
    await expect(new CreateReportShareUseCase(new FakeShares()).execute(99)).rejects.toThrow();
  });
});

describe("GetSharedReportUseCase", () => {
  it("returns null for an unknown, malformed or revoked token", async () => {
    const shares = new FakeShares();
    const { token } = await new CreateReportShareUseCase(shares).execute(EVENT.id);

    expect(await sharedReport(shares, generateShareToken())).toBeNull();
    expect(await sharedReport(shares, "")).toBeNull();
    expect(await sharedReport(shares, "../../etc/passwd")).toBeNull();
    expect(await sharedReport(shares, token)).not.toBeNull();

    await new RevokeReportShareUseCase(shares).execute(EVENT.id);
    expect(await sharedReport(shares, token)).toBeNull();
  });

  it("carries the report numbers but no name, phone, code, note, door code or scan log by default", async () => {
    const shares = new FakeShares();
    const { token } = await new CreateReportShareUseCase(shares).execute(EVENT.id);

    const view = await sharedReport(shares, token);
    const serialised = JSON.stringify(view);

    expect(view?.event).toEqual({ name: "Layla & Omar", eventDate: "2026-11-10", venue: "The Palm Hall", capacity: 120 });
    expect(view?.summary.invitedGuests).toBe(1);
    expect(view?.occupancy.peak).toEqual({ inside: 2, at: at("18:00") });
    expect(view?.guests).toBeNull();
    for (const secret of ["Sara", "0501234567", "SECRETCODE", "Allergic", "PALM1", "secret-place", "Private family", "scannedBy", "Late One"]) {
      expect(serialised).not.toContain(secret);
    }
    expect(view?.dwell.earlyLeavers).toHaveLength(1);
    expect(view?.dwell.earlyLeavers[0].name).toBeNull();
    expect(view?.dwell.shortest?.name).toBeNull();
  });

  it("names guests once the owner opts in — and still no phone, code, note or door code", async () => {
    const shares = new FakeShares();
    const { token } = await new CreateReportShareUseCase(shares).execute(EVENT.id);
    await new SetReportShareNamesUseCase(shares).execute(EVENT.id, true);

    const view = await sharedReport(shares, token);
    const serialised = JSON.stringify(view);

    expect(view?.guests?.map((guest) => guest.name)).toEqual(["Sara Ahmed"]);
    expect(view?.dwell.earlyLeavers[0].name).toBe("Sara Ahmed");
    for (const secret of ["0501234567", "SECRETCODE", "Allergic", "PALM1", "secret-place", "Private family", "scannedBy"]) {
      expect(serialised).not.toContain(secret);
    }
  });
});
