import { beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/shared/infrastructure/db/test-helpers";
import { EventRepository } from "./EventRepository";

const BASE = {
  name: "Layla & Omar",
  eventDate: "2026-11-01",
  venue: "The Palm Hall",
  locationLink: null,
  description: null,
  doorCode: "PALM1",
  capacity: 200,
};

describe("EventRepository (integration)", () => {
  beforeEach(resetDb);

  it("persists and retrieves an event through Postgres", async () => {
    const repo = new EventRepository();
    const created = await repo.create(BASE);

    expect(created.status).toBe("live");
    expect((await repo.getById(created.id))?.name).toBe("Layla & Omar");
    expect((await repo.getByDoorCode("PALM1"))?.id).toBe(created.id);
    expect(await repo.getByDoorCode("NOPE")).toBeNull();
  });

  it("lists newest first, updates, and archives", async () => {
    const repo = new EventRepository();
    const first = await repo.create(BASE);
    const second = await repo.create({ ...BASE, doorCode: "PALM2" });

    const listed = await repo.list();
    expect(listed.map((e) => e.id)).toEqual([second.id, first.id]);

    await repo.update(first.id, { ...BASE, name: "Reception", doorCode: "PALM1" });
    expect((await repo.getById(first.id))?.name).toBe("Reception");

    await repo.archive(first.id);
    expect((await repo.getById(first.id))?.status).toBe("archived");
  });
});
