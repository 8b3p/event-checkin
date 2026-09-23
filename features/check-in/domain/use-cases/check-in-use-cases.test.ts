import { describe, expect, it } from "vitest";
import type {
  ArrivalBucket,
  EventStats,
  GuestWithStatus,
  RecentScan,
  RecordScanInput,
  ScanEvent,
} from "../ScanEvent";
import type { IScanRepository } from "../IScanRepository";
import type { BulkGuestRow, CreateGuestInput, Guest, UpdateGuestInput } from "@/features/guests/domain/Guest";
import type { IGuestRepository } from "@/features/guests/domain/IGuestRepository";
import { GetArrivalBucketsUseCase } from "./GetArrivalBucketsUseCase";
import { GetEventStatsUseCase } from "./GetEventStatsUseCase";
import { GetGuestInsideSeatsUseCase } from "./GetGuestInsideSeatsUseCase";
import { GetRecentScansUseCase } from "./GetRecentScansUseCase";
import { ListGuestsWithStatusUseCase } from "./ListGuestsWithStatusUseCase";
import { UndoLastScanUseCase } from "./UndoLastScanUseCase";
import { RecordScanUseCase } from "./RecordScanUseCase";
import { AddWalkInGuestUseCase } from "./AddWalkInGuestUseCase";

class FakeGuestRepository implements IGuestRepository {
  rows: Guest[] = [];
  private nextId = 1;

  async listForEvent(eventId: number): Promise<Guest[]> {
    return this.rows.filter((g) => g.eventId === eventId);
  }
  async getById(eventId: number, id: number): Promise<Guest | null> {
    return this.rows.find((g) => g.eventId === eventId && g.id === id) ?? null;
  }
  async getByCode(code: string): Promise<Guest | null> {
    return this.rows.find((g) => g.code === code) ?? null;
  }
  async create(input: CreateGuestInput): Promise<Guest> {
    const guest: Guest = { id: this.nextId++, createdAt: new Date(), ...input };
    this.rows.push(guest);
    return guest;
  }
  async createMany(eventId: number, rows: BulkGuestRow[]): Promise<number> {
    for (const row of rows) await this.create({ ...row, eventId, source: "invited" });
    return rows.length;
  }
  async update(eventId: number, id: number, input: UpdateGuestInput): Promise<void> {
    const guest = await this.getById(eventId, id);
    if (guest) Object.assign(guest, input);
  }
  async delete(eventId: number, id: number): Promise<void> {
    this.rows = this.rows.filter((g) => !(g.eventId === eventId && g.id === id));
  }
}

class FakeScanRepository implements IScanRepository {
  scans: ScanEvent[] = [];
  guestsWithStatus: GuestWithStatus[] = [];
  stats: EventStats = { invites: 0, seatsInvited: 0, guestsInside: 0, seatsInside: 0 };
  buckets: ArrivalBucket[] = [];
  recent: RecentScan[] = [];
  private nextId = 1;

  async record(input: RecordScanInput): Promise<ScanEvent> {
    const scan: ScanEvent = { id: this.nextId++, at: new Date(), ...input };
    this.scans.push(scan);
    return scan;
  }

  async listForGuest(guestId: number): Promise<ScanEvent[]> {
    return this.scans.filter((s) => s.guestId === guestId);
  }

  async undoLast(guestId: number): Promise<boolean> {
    const last = [...this.scans].reverse().find((s) => s.guestId === guestId);
    if (!last) return false;
    this.scans = this.scans.filter((s) => s.id !== last.id);
    return true;
  }

  async insideSeatsForGuest(guestId: number): Promise<number> {
    return this.scans
      .filter((s) => s.guestId === guestId)
      .reduce((seats, scan) => {
        return scan.direction === "in" ? seats + scan.seats : seats - scan.seats;
      }, 0);
  }

  async listGuestsWithStatus(): Promise<GuestWithStatus[]> {
    return this.guestsWithStatus;
  }

  async eventStats(): Promise<EventStats> {
    return this.stats;
  }

  async arrivalBuckets(): Promise<ArrivalBucket[]> {
    return this.buckets;
  }

  async recentScans(): Promise<RecentScan[]> {
    return this.recent;
  }
}

describe("check-in use-cases", () => {
  it("undoes the most recent scan for a guest, returns false if none exist", async () => {
    const repo = new FakeScanRepository();
    await repo.record({ guestId: 1, direction: "in", method: "qr", seats: 2, scannedBy: "door", override: false });

    expect(await new UndoLastScanUseCase(repo).execute(1)).toBe(true);
    expect(repo.scans).toHaveLength(0);
    expect(await new UndoLastScanUseCase(repo).execute(1)).toBe(false);
  });

  it("passes through guest status, stats, arrival buckets, recent scans, and inside seats", async () => {
    const repo = new FakeScanRepository();
    repo.guestsWithStatus = [
      { id: 1, name: "Sara", seats: 2, phone: null, note: null, code: "X", source: "invited", insideSeats: 2 },
    ];
    repo.stats = { invites: 1, seatsInvited: 2, guestsInside: 1, seatsInside: 2 };
    repo.buckets = [{ minute: "2026-11-01T20:00:00.000Z", seats: 2 }];
    repo.recent = [{ guestName: "Sara", direction: "in", method: "qr", seats: 2, at: new Date(), scannedBy: "door", override: false }];

    expect(await new ListGuestsWithStatusUseCase(repo).execute(1)).toEqual(repo.guestsWithStatus);
    expect(await new ListGuestsWithStatusUseCase(repo).execute(1, "sara")).toEqual(repo.guestsWithStatus);
    expect(await new GetEventStatsUseCase(repo).execute(1)).toEqual(repo.stats);
    expect(await new GetArrivalBucketsUseCase(repo).execute(1)).toEqual(repo.buckets);
    expect(await new GetRecentScansUseCase(repo).execute(1)).toEqual(repo.recent);
    expect(await new GetGuestInsideSeatsUseCase(repo).execute(1)).toBe(0);
  });
});

describe("RecordScanUseCase", () => {
  it("checks a guest in for their full party size when outside", async () => {
    const repo = new FakeScanRepository();
    const result = await new RecordScanUseCase(repo).execute({
      guestId: 1,
      partySeats: 3,
      direction: "in",
      method: "qr",
      seats: 3,
      scannedBy: "door",
      override: false,
    });

    expect(result).toEqual({
      outcome: "recorded",
      scan: expect.objectContaining({ guestId: 1, direction: "in", seats: 3 }),
      insideSeats: 3,
    });
  });

  it("clamps a check-in to the remaining seats when the requested count is too high", async () => {
    const repo = new FakeScanRepository();
    await repo.record({ guestId: 1, direction: "in", method: "qr", seats: 2, scannedBy: "door", override: false });

    const result = await new RecordScanUseCase(repo).execute({
      guestId: 1,
      partySeats: 3,
      direction: "in",
      method: "manual",
      seats: 99,
      scannedBy: "door",
      override: false,
    });

    expect(result).toEqual({
      outcome: "recorded",
      scan: expect.objectContaining({ seats: 1 }),
      insideSeats: 3,
    });
  });

  it("blocks a check-in when the party is already fully inside, unless overridden", async () => {
    const repo = new FakeScanRepository();
    await repo.record({ guestId: 1, direction: "in", method: "qr", seats: 2, scannedBy: "door", override: false });

    const blocked = await new RecordScanUseCase(repo).execute({
      guestId: 1,
      partySeats: 2,
      direction: "in",
      method: "qr",
      seats: 2,
      scannedBy: "door",
      override: false,
    });
    expect(blocked).toEqual({ outcome: "blocked", reason: "already_full", insideSeats: 2 });

    const overridden = await new RecordScanUseCase(repo).execute({
      guestId: 1,
      partySeats: 2,
      direction: "in",
      method: "qr",
      seats: 2,
      scannedBy: "door",
      override: true,
    });
    expect(overridden).toEqual({
      outcome: "recorded",
      scan: expect.objectContaining({ seats: 2, override: true }),
      insideSeats: 4,
    });
  });

  it("checks a guest out, clamped to the seats currently inside", async () => {
    const repo = new FakeScanRepository();
    await repo.record({ guestId: 1, direction: "in", method: "qr", seats: 3, scannedBy: "door", override: false });

    const result = await new RecordScanUseCase(repo).execute({
      guestId: 1,
      partySeats: 3,
      direction: "out",
      method: "manual",
      seats: 99,
      scannedBy: "door",
      override: false,
    });

    expect(result).toEqual({
      outcome: "recorded",
      scan: expect.objectContaining({ direction: "out", seats: 3 }),
      insideSeats: 0,
    });
  });

  it("blocks a check-out when nobody from the party is inside, unless overridden", async () => {
    const repo = new FakeScanRepository();

    const blocked = await new RecordScanUseCase(repo).execute({
      guestId: 1,
      partySeats: 2,
      direction: "out",
      method: "qr",
      seats: 1,
      scannedBy: "door",
      override: false,
    });
    expect(blocked).toEqual({ outcome: "blocked", reason: "not_inside", insideSeats: 0 });

    const overridden = await new RecordScanUseCase(repo).execute({
      guestId: 1,
      partySeats: 2,
      direction: "out",
      method: "qr",
      seats: 1,
      scannedBy: "door",
      override: true,
    });
    expect(overridden.outcome).toBe("recorded");
  });
});

describe("AddWalkInGuestUseCase", () => {
  it("creates a walk-in guest with a generated code and checks them in as a manual entry", async () => {
    const guests = new FakeGuestRepository();
    const scans = new FakeScanRepository();

    const result = await new AddWalkInGuestUseCase(guests, scans).execute({
      eventId: 7,
      name: "Family of Samir",
      seats: 4,
      scannedBy: "door",
    });

    expect(result.guest).toMatchObject({ eventId: 7, name: "Family of Samir", seats: 4, source: "walk_in" });
    expect(result.guest.code).toHaveLength(10);
    expect(result.insideSeats).toBe(4);

    expect(scans.scans).toHaveLength(1);
    expect(scans.scans[0]).toMatchObject({
      guestId: result.guest.id,
      direction: "in",
      method: "manual",
      seats: 4,
      scannedBy: "door",
      override: false,
    });
  });
});
