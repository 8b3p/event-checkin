import { describe, expect, it } from "vitest";
import type { Event, EventInput } from "../Event";
import type { IEventRepository } from "../IEventRepository";
import { ArchiveEventUseCase } from "./ArchiveEventUseCase";
import { CreateEventUseCase } from "./CreateEventUseCase";
import { DuplicateEventUseCase } from "./DuplicateEventUseCase";
import { GetEventUseCase } from "./GetEventUseCase";
import { ListEventsUseCase } from "./ListEventsUseCase";
import { UpdateEventUseCase } from "./UpdateEventUseCase";

class FakeEventRepository implements IEventRepository {
  private rows: Event[] = [];
  private nextId = 1;

  async list(): Promise<Event[]> {
    return [...this.rows].sort((a, b) => b.id - a.id);
  }

  async getById(id: number): Promise<Event | null> {
    return this.rows.find((row) => row.id === id) ?? null;
  }

  async getByDoorCode(doorCode: string): Promise<Event | null> {
    return this.rows.find((row) => row.doorCode === doorCode) ?? null;
  }

  async create(input: EventInput): Promise<Event> {
    const event: Event = { id: this.nextId++, ...input, status: "live", createdAt: new Date() };
    this.rows.push(event);
    return event;
  }

  async update(id: number, input: EventInput): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) Object.assign(row, input);
  }

  async archive(id: number): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) row.status = "archived";
  }
}

const BASE: EventInput = {
  name: "Layla & Omar",
  eventDate: "2026-11-01",
  venue: "The Palm Hall",
  locationLink: null,
  description: null,
  doorCode: "PALM1",
  capacity: 200,
};

describe("event use-cases", () => {
  it("creates and lists events, newest first", async () => {
    const repo = new FakeEventRepository();
    const first = await new CreateEventUseCase(repo).execute(BASE);
    const second = await new CreateEventUseCase(repo).execute({ ...BASE, name: "Sara's Birthday", doorCode: "SARA1" });

    const events = await new ListEventsUseCase(repo).execute();
    expect(events.map((e) => e.id)).toEqual([second.id, first.id]);
    expect(first.status).toBe("live");
  });

  it("gets an event by id", async () => {
    const repo = new FakeEventRepository();
    const created = await repo.create(BASE);
    expect((await new GetEventUseCase(repo).execute(created.id))?.name).toBe("Layla & Omar");
    expect(await new GetEventUseCase(repo).execute(999999)).toBeNull();
  });

  it("updates an event", async () => {
    const repo = new FakeEventRepository();
    const created = await repo.create(BASE);
    await new UpdateEventUseCase(repo).execute(created.id, { ...BASE, name: "Reception", doorCode: "PALM2" });

    const updated = await repo.getById(created.id);
    expect(updated?.name).toBe("Reception");
    expect(updated?.doorCode).toBe("PALM2");
  });

  it("stores a lowercase door code as uppercase, on both create and update", async () => {
    const repo = new FakeEventRepository();
    const created = await new CreateEventUseCase(repo).execute({ ...BASE, doorCode: "palm1" });
    expect(created.doorCode).toBe("PALM1");

    await new UpdateEventUseCase(repo).execute(created.id, { ...BASE, doorCode: "palm2" });
    expect((await repo.getById(created.id))?.doorCode).toBe("PALM2");
  });

  it("archives an event", async () => {
    const repo = new FakeEventRepository();
    const created = await repo.create(BASE);
    await new ArchiveEventUseCase(repo).execute(created.id);
    expect((await repo.getById(created.id))?.status).toBe("archived");
  });

  it("duplicates an event's settings with a new door code and no date", async () => {
    const repo = new FakeEventRepository();
    const created = await repo.create(BASE);
    const copy = await new DuplicateEventUseCase(repo).execute(created.id, "PALM-COPY");

    expect(copy.id).not.toBe(created.id);
    expect(copy.name).toBe(created.name);
    expect(copy.venue).toBe(created.venue);
    expect(copy.doorCode).toBe("PALM-COPY");
    expect(copy.eventDate).toBeNull();
    expect(copy.status).toBe("live");
  });

  it("throws duplicating a nonexistent event", async () => {
    const repo = new FakeEventRepository();
    await expect(new DuplicateEventUseCase(repo).execute(999999, "X")).rejects.toThrow();
  });

  it("rejects an empty name or a too-short door code on create", async () => {
    const repo = new FakeEventRepository();
    await expect(new CreateEventUseCase(repo).execute({ ...BASE, name: "   " })).rejects.toThrow();
    await expect(new CreateEventUseCase(repo).execute({ ...BASE, doorCode: "ab" })).rejects.toThrow();
  });

  it("rejects an empty name or a too-short door code on update", async () => {
    const repo = new FakeEventRepository();
    const created = await repo.create(BASE);
    await expect(new UpdateEventUseCase(repo).execute(created.id, { ...BASE, name: "  " })).rejects.toThrow();
    await expect(new UpdateEventUseCase(repo).execute(created.id, { ...BASE, doorCode: "ab" })).rejects.toThrow();
  });

  it("rejects creating an event with a door code already in use", async () => {
    const repo = new FakeEventRepository();
    await new CreateEventUseCase(repo).execute(BASE);
    await expect(new CreateEventUseCase(repo).execute({ ...BASE, name: "Other Event" })).rejects.toThrow();
  });

  it("rejects updating an event to a door code another event already uses, but allows keeping its own", async () => {
    const repo = new FakeEventRepository();
    const first = await new CreateEventUseCase(repo).execute(BASE);
    const second = await new CreateEventUseCase(repo).execute({ ...BASE, name: "Other Event", doorCode: "OTHER1" });

    await expect(new UpdateEventUseCase(repo).execute(second.id, { ...BASE, name: "Other Event", doorCode: "PALM1" })).rejects.toThrow();
    await expect(new UpdateEventUseCase(repo).execute(first.id, { ...BASE, doorCode: "PALM1" })).resolves.toBeUndefined();
  });
});
