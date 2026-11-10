import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/shared/infrastructure/db/client";
import { events } from "@/shared/infrastructure/db/schema";
import type { IReportShareRepository } from "../domain/IReportShareRepository";
import type { ReportShare } from "../domain/ReportShare";

const shareColumns = {
  id: events.id,
  token: events.reportShareToken,
  sharedAt: events.reportSharedAt,
  showNames: events.reportShareShowNames,
};

function toShare(row: { token: string | null; sharedAt: Date | null; showNames: boolean }): ReportShare | null {
  return row.token && row.sharedAt ? { token: row.token, sharedAt: row.sharedAt, showNames: row.showNames } : null;
}

export class ReportShareRepository implements IReportShareRepository {
  async getByEventId(eventId: number): Promise<ReportShare | null> {
    const rows = await getDb().select(shareColumns).from(events).where(eq(events.id, eventId)).limit(1);
    return rows[0] ? toShare(rows[0]) : null;
  }

  async getByToken(token: string): Promise<{ eventId: number; share: ReportShare } | null> {
    const rows = await getDb().select(shareColumns).from(events).where(eq(events.reportShareToken, token)).limit(1);
    const share = rows[0] ? toShare(rows[0]) : null;
    return rows[0] && share ? { eventId: rows[0].id, share } : null;
  }

  async create(eventId: number, token: string): Promise<ReportShare | null> {
    const claimed = await getDb()
      .update(events)
      .set({ reportShareToken: token, reportSharedAt: new Date(), reportShareShowNames: false })
      .where(and(eq(events.id, eventId), isNull(events.reportShareToken)))
      .returning(shareColumns);
    if (claimed[0]) return toShare(claimed[0]);

    // Already shared (or no such event): hand back what is in force.
    return this.getByEventId(eventId);
  }

  async setShowNames(eventId: number, showNames: boolean): Promise<void> {
    await getDb().update(events).set({ reportShareShowNames: showNames }).where(eq(events.id, eventId));
  }

  async revoke(eventId: number): Promise<void> {
    await getDb()
      .update(events)
      .set({ reportShareToken: null, reportSharedAt: null, reportShareShowNames: false })
      .where(eq(events.id, eventId));
  }
}
