import { beforeEach, describe, expect, it } from "vitest";
import { EventRepository } from "@/features/events/infrastructure/EventRepository";
import { GuestRepository } from "@/features/guests/infrastructure/GuestRepository";
import { getDb } from "@/shared/infrastructure/db/client";
import { guestFeedback } from "@/shared/infrastructure/db/schema";
import { resetDb } from "@/shared/infrastructure/db/test-helpers";
import { FeedbackRepository } from "./FeedbackRepository";

const EVENT = {
  name: "Layla & Omar",
  eventDate: null,
  venue: null,
  locationLink: null,
  description: null,
  doorCode: "PALM1",
  capacity: null,
};

async function seedGuest(eventId: number, name: string, code: string) {
  return new GuestRepository().create({ eventId, name, seats: 1, phone: null, note: null, code, source: "invited" });
}

describe("FeedbackRepository (integration)", () => {
  beforeEach(resetDb);

  it("upserts one row per guest: a second submit revises the first", async () => {
    const event = await new EventRepository().create(EVENT);
    const guest = await seedGuest(event.id, "Sara", "CODE0001");
    const repo = new FeedbackRepository();

    const first = await repo.upsert({ guestId: guest.id, rating: 3, comment: "ok" });
    const second = await repo.upsert({ guestId: guest.id, rating: 5, comment: null });

    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({ rating: 5, comment: null });
    expect(second.createdAt.getTime()).toBe(first.createdAt.getTime());
    expect(second.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
    expect(await getDb().select().from(guestFeedback)).toHaveLength(1);
    expect(await repo.getForGuest(guest.id)).toMatchObject({ rating: 5, comment: null });
  });

  it("returns null for a guest with no feedback", async () => {
    const event = await new EventRepository().create(EVENT);
    const guest = await seedGuest(event.id, "Sara", "CODE0001");
    expect(await new FeedbackRepository().getForGuest(guest.id)).toBeNull();
  });

  it("lists an event's feedback newest first, with guest names, scoped to that event", async () => {
    const eventRepo = new EventRepository();
    const eventA = await eventRepo.create(EVENT);
    const eventB = await eventRepo.create({ ...EVENT, doorCode: "PALM2" });
    const sara = await seedGuest(eventA.id, "Sara", "CODE0001");
    const omar = await seedGuest(eventA.id, "Omar", "CODE0002");
    const other = await seedGuest(eventB.id, "Other", "CODE0003");
    const repo = new FeedbackRepository();

    await repo.upsert({ guestId: sara.id, rating: 4, comment: "great" });
    await repo.upsert({ guestId: omar.id, rating: 2, comment: null });
    await repo.upsert({ guestId: other.id, rating: 1, comment: "elsewhere" });
    // Sara revises last, so she becomes the newest entry.
    await repo.upsert({ guestId: sara.id, rating: 5, comment: "even better" });

    const listed = await repo.listForEvent(eventA.id);
    expect(listed.map((item) => [item.guestName, item.rating, item.comment])).toEqual([
      ["Sara", 5, "even better"],
      ["Omar", 2, null],
    ]);
  });

  it("rejects a rating outside 1..5 at the database level", async () => {
    const event = await new EventRepository().create(EVENT);
    const guest = await seedGuest(event.id, "Sara", "CODE0001");
    const repo = new FeedbackRepository();

    await expect(repo.upsert({ guestId: guest.id, rating: 6, comment: null })).rejects.toThrow();
    await expect(repo.upsert({ guestId: guest.id, rating: 0, comment: null })).rejects.toThrow();
  });

  it("deletes a guest's feedback along with the guest", async () => {
    const event = await new EventRepository().create(EVENT);
    const guest = await seedGuest(event.id, "Sara", "CODE0001");
    const repo = new FeedbackRepository();
    await repo.upsert({ guestId: guest.id, rating: 4, comment: null });

    await new GuestRepository().delete(event.id, guest.id);

    expect(await getDb().select().from(guestFeedback)).toHaveLength(0);
  });
});
