import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/shared/infrastructure/db/client";
import { guests } from "@/shared/infrastructure/db/schema";
import type { BulkGuestRow, CreateGuestInput, Guest, UpdateGuestInput } from "../domain/Guest";
import type { IGuestRepository } from "../domain/IGuestRepository";

function toGuest(row: typeof guests.$inferSelect): Guest {
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    seats: row.seats,
    phone: row.phone,
    note: row.note,
    code: row.code,
    source: row.source,
    createdAt: row.createdAt,
  };
}

export class GuestRepository implements IGuestRepository {
  async listForEvent(eventId: number): Promise<Guest[]> {
    const rows = await getDb().select().from(guests).where(eq(guests.eventId, eventId)).orderBy(asc(guests.name));
    return rows.map(toGuest);
  }

  async getById(eventId: number, id: number): Promise<Guest | null> {
    const rows = await getDb()
      .select()
      .from(guests)
      .where(and(eq(guests.id, id), eq(guests.eventId, eventId)))
      .limit(1);
    return rows[0] ? toGuest(rows[0]) : null;
  }

  async getByCode(code: string): Promise<Guest | null> {
    const rows = await getDb().select().from(guests).where(eq(guests.code, code)).limit(1);
    return rows[0] ? toGuest(rows[0]) : null;
  }

  async create(input: CreateGuestInput): Promise<Guest> {
    const rows = await getDb().insert(guests).values(input).returning();
    return toGuest(rows[0]);
  }

  async createMany(eventId: number, rows: BulkGuestRow[]): Promise<number> {
    if (rows.length === 0) return 0;
    const inserted = await getDb()
      .insert(guests)
      .values(rows.map((row) => ({ ...row, eventId, source: "invited" as const })))
      .returning({ id: guests.id });
    return inserted.length;
  }

  async update(eventId: number, id: number, input: UpdateGuestInput): Promise<void> {
    await getDb()
      .update(guests)
      .set(input)
      .where(and(eq(guests.id, id), eq(guests.eventId, eventId)));
  }

  async delete(eventId: number, id: number): Promise<void> {
    await getDb()
      .delete(guests)
      .where(and(eq(guests.id, id), eq(guests.eventId, eventId)));
  }
}
