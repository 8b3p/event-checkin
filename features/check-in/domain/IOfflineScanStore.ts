import type { EventStats, GuestWithStatus } from "../domain/ScanEvent";
import type { QueuedScan } from "../domain/offlineQueue";

export type OfflineMeta = { lastSyncedAt: number | null };

/**
 * One instance is bound to a single event's local cache (see
 * `IndexedDbOfflineScanStore.open(eventId)`), so no method takes an
 * eventId — that scoping happens once, at open time, exactly like a
 * database connection scoped to one database.
 */
export interface IOfflineScanStore {
  getGuests(): Promise<GuestWithStatus[]>;
  /** Bulk-replaces the cached guest list — used on first seed and on every
   * periodic/reconnect snapshot refresh (spec §6.6). */
  setGuests(guests: GuestWithStatus[]): Promise<void>;

  getQueue(): Promise<QueuedScan[]>;
  enqueueScan(scan: QueuedScan): Promise<void>;
  updateQueuedScan(clientScanId: string, patch: Partial<QueuedScan>): Promise<void>;
  removeQueuedScan(clientScanId: string): Promise<void>;

  getMeta(): Promise<OfflineMeta>;
  setMeta(meta: OfflineMeta): Promise<void>;

  getStats(): Promise<EventStats | null>;
  setStats(stats: EventStats): Promise<void>;
}
