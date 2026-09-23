import { and, asc, desc, eq, ilike } from "drizzle-orm";
import { getDb } from "@/shared/infrastructure/db/client";
import { guests, scanEvents } from "@/shared/infrastructure/db/schema";
import { foldGuestBalances } from "../domain/foldGuestBalances";
import type {
  ArrivalBucket,
  EventStats,
  GuestWithStatus,
  RecentScan,
  RecordScanInput,
  ScanEvent,
} from "../domain/ScanEvent";
import type { IScanRepository } from "../domain/IScanRepository";

function toScanEvent(row: typeof scanEvents.$inferSelect): ScanEvent {
  return {
    id: row.id,
    guestId: row.guestId,
    direction: row.direction,
    method: row.method,
    seats: row.seats,
    at: row.at,
    scannedBy: row.scannedBy,
    override: row.override,
  };
}

export class ScanRepository implements IScanRepository {
  async record(input: RecordScanInput): Promise<ScanEvent> {
    const rows = await getDb().insert(scanEvents).values(input).returning();
    return toScanEvent(rows[0]);
  }

  async listForGuest(guestId: number): Promise<ScanEvent[]> {
    const rows = await getDb()
      .select()
      .from(scanEvents)
      .where(eq(scanEvents.guestId, guestId))
      .orderBy(asc(scanEvents.at));
    return rows.map(toScanEvent);
  }

  async undoLast(guestId: number): Promise<boolean> {
    const rows = await getDb()
      .select({ id: scanEvents.id })
      .from(scanEvents)
      .where(eq(scanEvents.guestId, guestId))
      .orderBy(desc(scanEvents.at), desc(scanEvents.id))
      .limit(1);

    const last = rows[0];
    if (!last) return false;

    const result = await getDb().delete(scanEvents).where(eq(scanEvents.id, last.id));
    return (result.rowCount ?? 0) > 0;
  }

  async insideSeatsForGuest(guestId: number): Promise<number> {
    const rows = await getDb()
      .select({ direction: scanEvents.direction, seats: scanEvents.seats })
      .from(scanEvents)
      .where(eq(scanEvents.guestId, guestId));

    const balances = foldGuestBalances(rows.map((row) => ({ guestId, ...row })));
    return balances.get(guestId) ?? 0;
  }

  async listGuestsWithStatus(eventId: number, query?: string): Promise<GuestWithStatus[]> {
    const whereClause = query
      ? and(eq(guests.eventId, eventId), ilike(guests.name, `%${query}%`))
      : eq(guests.eventId, eventId);

    const guestRows = await getDb().select().from(guests).where(whereClause).orderBy(asc(guests.name));
    if (guestRows.length === 0) return [];

    // Scoped by event, not by the (possibly narrower) search results above —
    // only looked up by the guest ids in guestRows, so extra balances for
    // other guests in the same event are simply unused.
    const scanRows = await getDb()
      .select({ guestId: scanEvents.guestId, direction: scanEvents.direction, seats: scanEvents.seats })
      .from(scanEvents)
      .innerJoin(guests, eq(guests.id, scanEvents.guestId))
      .where(eq(guests.eventId, eventId));

    const balances = foldGuestBalances(scanRows);

    return guestRows.map((row) => ({
      id: row.id,
      name: row.name,
      seats: row.seats,
      phone: row.phone,
      note: row.note,
      code: row.code,
      source: row.source,
      insideSeats: balances.get(row.id) ?? 0,
    }));
  }

  async eventStats(eventId: number): Promise<EventStats> {
    const guestsWithStatus = await this.listGuestsWithStatus(eventId);

    return {
      invites: guestsWithStatus.length,
      seatsInvited: guestsWithStatus.reduce((sum, g) => sum + g.seats, 0),
      guestsInside: guestsWithStatus.filter((g) => g.insideSeats > 0).length,
      seatsInside: guestsWithStatus.reduce((sum, g) => sum + Math.max(g.insideSeats, 0), 0),
    };
  }

  /** Check-ins only (direction = 'in'), in 15-minute buckets, for the arrivals chart. */
  async arrivalBuckets(eventId: number): Promise<ArrivalBucket[]> {
    const rows = await getDb()
      .select({ at: scanEvents.at, seats: scanEvents.seats })
      .from(scanEvents)
      .innerJoin(guests, eq(guests.id, scanEvents.guestId))
      .where(and(eq(guests.eventId, eventId), eq(scanEvents.direction, "in")))
      .orderBy(asc(scanEvents.at));

    const buckets = new Map<string, number>();
    for (const row of rows) {
      const date = new Date(row.at);
      const flooredMinutes = Math.floor(date.getUTCMinutes() / 15) * 15;
      const bucket = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), flooredMinutes),
      ).toISOString();
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + row.seats);
    }

    return [...buckets.entries()]
      .map(([minute, seats]) => ({ minute, seats }))
      .sort((a, b) => a.minute.localeCompare(b.minute));
  }

  async recentScans(eventId: number, limit = 12): Promise<RecentScan[]> {
    return getDb()
      .select({
        guestName: guests.name,
        direction: scanEvents.direction,
        method: scanEvents.method,
        seats: scanEvents.seats,
        at: scanEvents.at,
        scannedBy: scanEvents.scannedBy,
        override: scanEvents.override,
      })
      .from(scanEvents)
      .innerJoin(guests, eq(guests.id, scanEvents.guestId))
      .where(eq(guests.eventId, eventId))
      .orderBy(desc(scanEvents.at), desc(scanEvents.id))
      .limit(limit);
  }
}
