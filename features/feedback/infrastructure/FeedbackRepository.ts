import { desc, eq } from "drizzle-orm";
import { getDb } from "@/shared/infrastructure/db/client";
import { guestFeedback, guests } from "@/shared/infrastructure/db/schema";
import type { EventFeedbackItem, GuestFeedback, SaveFeedbackInput } from "../domain/Feedback";
import type { IFeedbackRepository } from "../domain/IFeedbackRepository";

function toFeedback(row: typeof guestFeedback.$inferSelect): GuestFeedback {
  return {
    id: row.id,
    guestId: row.guestId,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class FeedbackRepository implements IFeedbackRepository {
  async upsert(input: SaveFeedbackInput): Promise<GuestFeedback> {
    const rows = await getDb()
      .insert(guestFeedback)
      .values(input)
      .onConflictDoUpdate({
        target: guestFeedback.guestId,
        set: { rating: input.rating, comment: input.comment, updatedAt: new Date() },
      })
      .returning();
    return toFeedback(rows[0]);
  }

  async getForGuest(guestId: number): Promise<GuestFeedback | null> {
    const rows = await getDb().select().from(guestFeedback).where(eq(guestFeedback.guestId, guestId)).limit(1);
    return rows[0] ? toFeedback(rows[0]) : null;
  }

  async listForEvent(eventId: number): Promise<EventFeedbackItem[]> {
    return getDb()
      .select({
        guestId: guestFeedback.guestId,
        guestName: guests.name,
        rating: guestFeedback.rating,
        comment: guestFeedback.comment,
        createdAt: guestFeedback.createdAt,
        updatedAt: guestFeedback.updatedAt,
      })
      .from(guestFeedback)
      .innerJoin(guests, eq(guests.id, guestFeedback.guestId))
      .where(eq(guests.eventId, eventId))
      .orderBy(desc(guestFeedback.updatedAt), desc(guestFeedback.id));
  }
}
