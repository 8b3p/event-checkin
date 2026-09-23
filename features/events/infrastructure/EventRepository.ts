import { desc, eq } from "drizzle-orm";
import { getDb } from "@/shared/infrastructure/db/client";
import { events } from "@/shared/infrastructure/db/schema";
import type { Event, EventInput } from "../domain/Event";
import type { IEventRepository } from "../domain/IEventRepository";

function toEvent(row: typeof events.$inferSelect): Event {
  return {
    id: row.id,
    name: row.name,
    eventDate: row.eventDate,
    venue: row.venue,
    locationLink: row.locationLink,
    description: row.description,
    doorCode: row.doorCode,
    capacity: row.capacity,
    status: row.status,
    createdAt: row.createdAt,
  };
}

export class EventRepository implements IEventRepository {
  async list(): Promise<Event[]> {
    const rows = await getDb().select().from(events).orderBy(desc(events.createdAt));
    return rows.map(toEvent);
  }

  async getById(id: number): Promise<Event | null> {
    const rows = await getDb().select().from(events).where(eq(events.id, id)).limit(1);
    return rows[0] ? toEvent(rows[0]) : null;
  }

  async getByDoorCode(doorCode: string): Promise<Event | null> {
    const rows = await getDb().select().from(events).where(eq(events.doorCode, doorCode)).limit(1);
    return rows[0] ? toEvent(rows[0]) : null;
  }

  async create(input: EventInput): Promise<Event> {
    const rows = await getDb()
      .insert(events)
      .values({ ...input, status: "live" })
      .returning();
    return toEvent(rows[0]);
  }

  async update(id: number, input: EventInput): Promise<void> {
    await getDb().update(events).set(input).where(eq(events.id, id));
  }

  async archive(id: number): Promise<void> {
    await getDb().update(events).set({ status: "archived" }).where(eq(events.id, id));
  }
}
