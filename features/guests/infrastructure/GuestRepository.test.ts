import { beforeEach, describe, expect, it } from "vitest";
import { EventRepository } from "@/features/events/infrastructure/EventRepository";
import { ScanRepository } from "@/features/check-in/infrastructure/ScanRepository";
import { FeedbackRepository } from "@/features/feedback/infrastructure/FeedbackRepository";
import { resetDb } from "@/shared/infrastructure/db/test-helpers";
import { GuestRepository } from "./GuestRepository";

const EVENT = {
  name: "Layla & Omar",
  eventDate: null,
  venue: null,
  locationLink: null,
  description: null,
  doorCode: "PALM1",
  capacity: null,
};

describe("GuestRepository (integration)", () => {
  beforeEach(resetDb);

  it("creates a guest scoped to an event and reads it back by id and code", async () => {
    const event = await new EventRepository().create(EVENT);
    const repo = new GuestRepository();

    const guest = await repo.create({
      eventId: event.id,
      name: "Sara Ahmed",
      seats: 2,
      phone: null,
      note: null,
      code: "ABC123XY",
      source: "invited",
    });

    expect(guest.eventId).toBe(event.id);
    expect(await repo.getById(event.id, guest.id)).toMatchObject({ name: "Sara Ahmed", seats: 2 });
    expect((await repo.getByCode("ABC123XY"))?.id).toBe(guest.id);
  });

  it("only lists guests belonging to the given event", async () => {
    const eventRepo = new EventRepository();
    const eventA = await eventRepo.create(EVENT);
    const eventB = await eventRepo.create({ ...EVENT, doorCode: "PALM2" });
    const repo = new GuestRepository();

    await repo.create({ eventId: eventA.id, name: "A Guest", seats: 1, phone: null, note: null, code: "CODEA123", source: "invited" });
    await repo.create({ eventId: eventB.id, name: "B Guest", seats: 1, phone: null, note: null, code: "CODEB123", source: "invited" });

    const guestsA = await repo.listForEvent(eventA.id);
    expect(guestsA).toHaveLength(1);
    expect(guestsA[0].name).toBe("A Guest");
  });

  it("bulk-creates guests, updates, and deletes", async () => {
    const event = await new EventRepository().create(EVENT);
    const repo = new GuestRepository();

    const created = await repo.createMany(event.id, [
      { name: "One", seats: 1, phone: null, note: null, code: "BULK0001" },
      { name: "Two", seats: 3, phone: "0500000000", note: "vegan", code: "BULK0002" },
    ]);
    expect(created).toBe(2);

    const guests = await repo.listForEvent(event.id);
    expect(guests.every((g) => g.source === "invited")).toBe(true);

    const first = guests[0];
    await repo.update(event.id, first.id, { name: "One Updated", seats: 2, phone: null, note: null });
    expect((await repo.getById(event.id, first.id))?.name).toBe("One Updated");

    await repo.delete(event.id, first.id);
    expect(await repo.getById(event.id, first.id)).toBeNull();
  });

  it("does not get, update, or delete a guest scoped to a different event", async () => {
    const eventRepo = new EventRepository();
    const eventA = await eventRepo.create(EVENT);
    const eventB = await eventRepo.create({ ...EVENT, doorCode: "PALM2" });
    const repo = new GuestRepository();

    const guest = await repo.create({
      eventId: eventA.id,
      name: "A Guest",
      seats: 1,
      phone: null,
      note: null,
      code: "CROSS001",
      source: "invited",
    });

    // Wrong event: getById returns null.
    expect(await repo.getById(eventB.id, guest.id)).toBeNull();

    // Wrong event: update is a no-op.
    await repo.update(eventB.id, guest.id, { name: "Hijacked", seats: 9, phone: null, note: null });
    expect(await repo.getById(eventA.id, guest.id)).toMatchObject({ name: "A Guest", seats: 1 });

    // Wrong event: delete is a no-op.
    await repo.delete(eventB.id, guest.id);
    expect(await repo.getById(eventA.id, guest.id)).toMatchObject({ name: "A Guest" });

    // Correct event: all three succeed.
    expect((await repo.getById(eventA.id, guest.id))?.name).toBe("A Guest");
    await repo.delete(eventA.id, guest.id);
    expect(await repo.getById(eventA.id, guest.id)).toBeNull();
  });

  describe("mergeInto", () => {
    async function seed() {
      const events = new EventRepository();
      const event = await events.create(EVENT);
      const other = await events.create({ ...EVENT, doorCode: "PALM2" });
      const repo = new GuestRepository();
      const make = (eventId: number, name: string, code: string, extra: Partial<{ phone: string; note: string }> = {}) =>
        repo.create({
          eventId,
          name,
          seats: 2,
          phone: extra.phone ?? null,
          note: extra.note ?? null,
          code,
          source: "invited",
        });
      return { event, other, repo, make, scans: new ScanRepository() };
    }

    const scan = (guestId: number, direction: "in" | "out", clientScanId?: string) => ({
      guestId,
      direction,
      method: "qr" as const,
      seats: 2,
      scannedBy: "door",
      override: false,
      clientScanId,
    });

    it("moves every scan to the kept guest, deletes the merged one, and keeps the kept phone/note", async () => {
      const { event, repo, make, scans } = await seed();
      const keep = await make(event.id, "Sara", "KEEP0001", { phone: "0501111111", note: "A" });
      const merge = await make(event.id, "Sara", "MERGE001", { phone: "0502222222", note: "B" });
      await scans.record(scan(merge.id, "in", "c-1"));
      await scans.record(scan(merge.id, "out", "c-2"));
      await scans.record(scan(keep.id, "in"));

      const result = await repo.mergeInto(event.id, keep.id, merge.id, { phone: "keep", note: "keep" });

      expect(result).toEqual({ movedScans: 2 });
      expect(await repo.getById(event.id, merge.id)).toBeNull();
      const kept = await repo.getById(event.id, keep.id);
      expect(kept).toMatchObject({ phone: "0501111111", note: "A" });
      expect(await scans.listForGuest(keep.id)).toHaveLength(3);
      expect(await scans.listForGuest(merge.id)).toHaveLength(0);
    });

    it("takes the merged guest's phone and note when asked", async () => {
      const { event, repo, make } = await seed();
      const keep = await make(event.id, "Sara", "KEEP0001", { phone: "0501111111", note: "A" });
      const merge = await make(event.id, "Sara", "MERGE001", { phone: "0502222222", note: "B" });

      await repo.mergeInto(event.id, keep.id, merge.id, { phone: "merge", note: "merge" });

      expect(await repo.getById(event.id, keep.id)).toMatchObject({ phone: "0502222222", note: "B" });
    });

    it("mixes the picks per field", async () => {
      const { event, repo, make } = await seed();
      const keep = await make(event.id, "Sara", "KEEP0001", { phone: "0501111111", note: "A" });
      const merge = await make(event.id, "Sara", "MERGE001", { phone: "0502222222", note: "B" });

      await repo.mergeInto(event.id, keep.id, merge.id, { phone: "merge", note: "keep" });

      expect(await repo.getById(event.id, keep.id)).toMatchObject({ phone: "0502222222", note: "A" });
    });

    it("changes nothing when a guest belongs to another event", async () => {
      const { event, other, repo, make, scans } = await seed();
      const keep = await make(event.id, "Sara", "KEEP0001");
      const stranger = await make(other.id, "Sara", "OTHER001");
      await scans.record(scan(stranger.id, "in"));

      await expect(repo.mergeInto(event.id, keep.id, stranger.id, { phone: "keep", note: "keep" })).rejects.toThrow();

      expect(await repo.getById(other.id, stranger.id)).not.toBeNull();
      expect(await scans.listForGuest(stranger.id)).toHaveLength(1);
      expect(await scans.listForGuest(keep.id)).toHaveLength(0);
    });

    it("carries the merged guest's feedback over when the kept guest left none", async () => {
      const { event, repo, make } = await seed();
      const keep = await make(event.id, "Sara", "KEEP0001");
      const merge = await make(event.id, "Sara", "MERGE001");
      const feedback = new FeedbackRepository();
      await feedback.upsert({ guestId: merge.id, rating: 5, comment: "Lovely" });

      await repo.mergeInto(event.id, keep.id, merge.id, { phone: "keep", note: "keep" });

      expect(await feedback.getForGuest(keep.id)).toMatchObject({ rating: 5, comment: "Lovely" });
    });

    it("keeps the kept guest's own feedback when both answered", async () => {
      const { event, repo, make } = await seed();
      const keep = await make(event.id, "Sara", "KEEP0001");
      const merge = await make(event.id, "Sara", "MERGE001");
      const feedback = new FeedbackRepository();
      await feedback.upsert({ guestId: keep.id, rating: 4, comment: "Kept" });
      await feedback.upsert({ guestId: merge.id, rating: 1, comment: "Merged" });

      await repo.mergeInto(event.id, keep.id, merge.id, { phone: "keep", note: "keep" });

      expect(await feedback.getForGuest(keep.id)).toMatchObject({ rating: 4, comment: "Kept" });
      expect(await feedback.listForEvent(event.id)).toHaveLength(1);
    });

    it("changes nothing when the guest to merge doesn't exist", async () => {
      const { event, repo, make } = await seed();
      const keep = await make(event.id, "Sara", "KEEP0001", { phone: "0501111111" });

      await expect(repo.mergeInto(event.id, keep.id, 9999, { phone: "merge", note: "merge" })).rejects.toThrow();

      expect(await repo.getById(event.id, keep.id)).toMatchObject({ phone: "0501111111" });
    });
  });
});
