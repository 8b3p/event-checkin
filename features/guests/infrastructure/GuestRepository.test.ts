import { beforeEach, describe, expect, it } from "vitest";
import { EventRepository } from "@/features/events/infrastructure/EventRepository";
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
});
