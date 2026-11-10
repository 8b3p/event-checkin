import { beforeEach, describe, expect, it } from "vitest";
import { EventRepository } from "@/features/events/infrastructure/EventRepository";
import { resetDb } from "@/shared/infrastructure/db/test-helpers";
import { generateShareToken } from "@/shared/lib/share-token";
import { ReportShareRepository } from "./ReportShareRepository";

const EVENT = {
  name: "Layla & Omar",
  eventDate: null,
  venue: null,
  locationLink: null,
  description: null,
  doorCode: "PALM1",
  capacity: null,
};

describe("ReportShareRepository (integration)", () => {
  beforeEach(resetDb);

  it("starts out unshared", async () => {
    const event = await new EventRepository().create(EVENT);
    const repo = new ReportShareRepository();

    expect(await repo.getByEventId(event.id)).toBeNull();
    expect(await repo.getByToken(generateShareToken())).toBeNull();
  });

  it("creates a share that resolves back to its event by token", async () => {
    const event = await new EventRepository().create(EVENT);
    const repo = new ReportShareRepository();
    const token = generateShareToken();

    const share = await repo.create(event.id, token);

    expect(share).toMatchObject({ token, showNames: false });
    expect(share?.sharedAt).toBeInstanceOf(Date);
    expect(await repo.getByEventId(event.id)).toEqual(share);
    expect(await repo.getByToken(token)).toEqual({ eventId: event.id, share });
  });

  it("keeps the first link when asked to create again", async () => {
    const event = await new EventRepository().create(EVENT);
    const repo = new ReportShareRepository();
    const first = await repo.create(event.id, generateShareToken());

    const second = await repo.create(event.id, generateShareToken());

    expect(second).toEqual(first);
    expect(await repo.getByToken(first!.token)).not.toBeNull();
  });

  it("returns null when creating a share for an event that does not exist", async () => {
    expect(await new ReportShareRepository().create(999, generateShareToken())).toBeNull();
  });

  it("keeps each event's link separate", async () => {
    const events = new EventRepository();
    const a = await events.create(EVENT);
    const b = await events.create({ ...EVENT, doorCode: "PALM2" });
    const repo = new ReportShareRepository();
    const tokenA = generateShareToken();

    await repo.create(a.id, tokenA);

    expect((await repo.getByToken(tokenA))?.eventId).toBe(a.id);
    expect(await repo.getByEventId(b.id)).toBeNull();
  });

  it("revoking kills the old token, and a fresh link is a different token", async () => {
    const event = await new EventRepository().create(EVENT);
    const repo = new ReportShareRepository();
    const oldToken = generateShareToken();
    await repo.create(event.id, oldToken);
    await repo.setShowNames(event.id, true);

    await repo.revoke(event.id);

    expect(await repo.getByToken(oldToken)).toBeNull();
    expect(await repo.getByEventId(event.id)).toBeNull();

    const renewed = await repo.create(event.id, generateShareToken());
    expect(renewed?.token).not.toBe(oldToken);
    expect(renewed?.showNames).toBe(false);
    expect(await repo.getByToken(oldToken)).toBeNull();
  });

  it("toggles whether names are shown", async () => {
    const event = await new EventRepository().create(EVENT);
    const repo = new ReportShareRepository();
    await repo.create(event.id, generateShareToken());

    await repo.setShowNames(event.id, true);
    expect((await repo.getByEventId(event.id))?.showNames).toBe(true);

    await repo.setShowNames(event.id, false);
    expect((await repo.getByEventId(event.id))?.showNames).toBe(false);
  });

  it("refuses to give two events the same token", async () => {
    const events = new EventRepository();
    const a = await events.create(EVENT);
    const b = await events.create({ ...EVENT, doorCode: "PALM2" });
    const repo = new ReportShareRepository();
    const token = generateShareToken();
    await repo.create(a.id, token);

    await expect(repo.create(b.id, token)).rejects.toThrow();
  });
});
