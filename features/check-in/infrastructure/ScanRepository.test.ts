import { beforeEach, describe, expect, it } from "vitest";
import { EventRepository } from "@/features/events/infrastructure/EventRepository";
import { GuestRepository } from "@/features/guests/infrastructure/GuestRepository";
import { resetDb } from "@/shared/infrastructure/db/test-helpers";
import { ScanRepository } from "./ScanRepository";

const EVENT = {
  name: "Layla & Omar",
  eventDate: null,
  venue: null,
  locationLink: null,
  description: null,
  doorCode: "PALM1",
  capacity: null,
};

async function seedGuest(eventId: number, overrides: Partial<{ name: string; seats: number; code: string }> = {}) {
  return new GuestRepository().create({
    eventId,
    name: overrides.name ?? "Sara Ahmed",
    seats: overrides.seats ?? 2,
    phone: null,
    note: null,
    code: overrides.code ?? "ABCXYZ01",
    source: "invited",
  });
}

describe("ScanRepository (integration)", () => {
  beforeEach(resetDb);

  it("records a scan and reads back the guest's inside seats", async () => {
    const event = await new EventRepository().create(EVENT);
    const guest = await seedGuest(event.id);
    const repo = new ScanRepository();

    await repo.record({ guestId: guest.id, direction: "in", method: "qr", seats: 2, scannedBy: "door", override: false });

    expect(await repo.insideSeatsForGuest(guest.id)).toBe(2);
    expect(await repo.listForGuest(guest.id)).toHaveLength(1);
  });

  it("checking out reduces the inside balance", async () => {
    const event = await new EventRepository().create(EVENT);
    const guest = await seedGuest(event.id);
    const repo = new ScanRepository();

    await repo.record({ guestId: guest.id, direction: "in", method: "qr", seats: 2, scannedBy: "door", override: false });
    await repo.record({ guestId: guest.id, direction: "out", method: "manual", seats: 2, scannedBy: "door", override: false });

    expect(await repo.insideSeatsForGuest(guest.id)).toBe(0);
  });

  it("undoes the most recent scan only", async () => {
    const event = await new EventRepository().create(EVENT);
    const guest = await seedGuest(event.id);
    const repo = new ScanRepository();

    await repo.record({ guestId: guest.id, direction: "in", method: "qr", seats: 2, scannedBy: "door", override: false });
    await repo.record({ guestId: guest.id, direction: "out", method: "qr", seats: 1, scannedBy: "door", override: false });

    expect(await repo.undoLast(guest.id)).toBe(true);
    expect(await repo.insideSeatsForGuest(guest.id)).toBe(2);
    expect(await repo.undoLast(999999)).toBe(false);
  });

  it("scopes guest status and search to one event", async () => {
    const eventRepo = new EventRepository();
    const eventA = await eventRepo.create(EVENT);
    const eventB = await eventRepo.create({ ...EVENT, doorCode: "PALM2" });
    const guestA = await seedGuest(eventA.id, { name: "Sara Ahmed", code: "AAAAAAA1" });
    await seedGuest(eventB.id, { name: "Omar Khan", code: "BBBBBBB1" });

    const repo = new ScanRepository();
    await repo.record({ guestId: guestA.id, direction: "in", method: "qr", seats: 2, scannedBy: "door", override: false });

    const statusA = await repo.listGuestsWithStatus(eventA.id);
    expect(statusA).toHaveLength(1);
    expect(statusA[0]).toMatchObject({ name: "Sara Ahmed", insideSeats: 2 });

    expect(await repo.listGuestsWithStatus(eventA.id, "sara")).toHaveLength(1);
    expect(await repo.listGuestsWithStatus(eventA.id, "omar")).toHaveLength(0);
  });

  it("computes event stats from derived status", async () => {
    const event = await new EventRepository().create(EVENT);
    const inside = await seedGuest(event.id, { name: "Inside Guest", seats: 3, code: "INSIDE01" });
    await seedGuest(event.id, { name: "Outside Guest", seats: 1, code: "OUTSIDE1" });

    const repo = new ScanRepository();
    await repo.record({ guestId: inside.id, direction: "in", method: "qr", seats: 3, scannedBy: "door", override: false });

    expect(await repo.eventStats(event.id)).toEqual({
      invites: 2,
      seatsInvited: 4,
      guestsInside: 1,
      seatsInside: 3,
    });
  });

  it("lists recent scans newest first, scoped to the event", async () => {
    const event = await new EventRepository().create(EVENT);
    const guest = await seedGuest(event.id);
    const repo = new ScanRepository();

    await repo.record({ guestId: guest.id, direction: "in", method: "qr", seats: 2, scannedBy: "door", override: false });
    await repo.record({ guestId: guest.id, direction: "out", method: "manual", seats: 1, scannedBy: "door", override: false });

    const recent = await repo.recentScans(event.id, 5);
    expect(recent).toHaveLength(2);
    expect(recent[0].direction).toBe("out");
    expect(recent[0].guestName).toBe("Sara Ahmed");
  });

  it("scopes recent scans to one event, isolated from another event's scans", async () => {
    const eventRepo = new EventRepository();
    const eventA = await eventRepo.create(EVENT);
    const eventB = await eventRepo.create({ ...EVENT, doorCode: "PALM2" });
    const guestA = await seedGuest(eventA.id, { name: "Sara Ahmed", code: "AAAAAAA1" });
    const guestB = await seedGuest(eventB.id, { name: "Omar Khan", code: "BBBBBBB1" });

    const repo = new ScanRepository();
    await repo.record({ guestId: guestA.id, direction: "in", method: "qr", seats: 2, scannedBy: "door", override: false });
    await repo.record({ guestId: guestB.id, direction: "in", method: "qr", seats: 1, scannedBy: "door", override: false });

    const recentA = await repo.recentScans(eventA.id, 5);
    expect(recentA).toHaveLength(1);
    expect(recentA[0].guestName).toBe("Sara Ahmed");

    const recentB = await repo.recentScans(eventB.id, 5);
    expect(recentB).toHaveLength(1);
    expect(recentB[0].guestName).toBe("Omar Khan");
  });

  it("scopes arrival buckets to event and filters by direction (in only)", async () => {
    const eventRepo = new EventRepository();
    const eventA = await eventRepo.create(EVENT);
    const eventB = await eventRepo.create({ ...EVENT, doorCode: "PALM2" });

    const guestA = await seedGuest(eventA.id, { name: "Guest A", code: "AAAAAAA1", seats: 3 });
    const guestB = await seedGuest(eventB.id, { name: "Guest B", code: "BBBBBBB1", seats: 2 });

    const repo = new ScanRepository();

    // Record check-ins for both events
    await repo.record({ guestId: guestA.id, direction: "in", method: "qr", seats: 3, scannedBy: "door", override: false });
    await repo.record({ guestId: guestB.id, direction: "in", method: "qr", seats: 2, scannedBy: "door", override: false });

    // Record a checkout for guest A (should NOT be included in arrival buckets, only "in" counts)
    await repo.record({ guestId: guestA.id, direction: "out", method: "manual", seats: 1, scannedBy: "door", override: false });

    // Get arrival buckets for event A only
    const bucketsA = await repo.arrivalBuckets(eventA.id);

    // Should have exactly one bucket containing only guest A's check-in (3 seats)
    expect(bucketsA).toHaveLength(1);
    expect(bucketsA[0].seats).toBe(3);

    // Verify that event B's check-in is not included in event A's buckets
    const bucketsB = await repo.arrivalBuckets(eventB.id);
    expect(bucketsB).toHaveLength(1);
    expect(bucketsB[0].seats).toBe(2);
  });
});
