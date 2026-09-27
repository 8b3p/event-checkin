import type { EventStats } from "../ScanEvent";
import type { IOfflineScanStore } from "../IOfflineScanStore";
import type { ISyncTransport } from "../ISyncTransport";

export type SyncPendingScansResult = {
  syncedCount: number;
  /** The most recent authoritative stats seen this pass, if anything synced. */
  stats: EventStats | null;
  /** The session expired mid-queue — sync stopped without dropping the
   * remaining items; see spec §6.9. */
  pausedForAuth: boolean;
};

/**
 * Drains the local scan queue against the server, one pass: FIFO order,
 * each item recorded unconditionally and deduped by its `clientScanId`
 * (the transport's job, not this use-case's — see
 * `RecordSyncedScanUseCase`/spec §6.8). A network failure stops the pass
 * (every other queued item would fail the same way right now); a
 * rejection of one specific item does not (spec §6.6).
 *
 * On each success, the synced scan is removed from the queue and the
 * affected guest's cached baseline is updated to the server's returned
 * `insideSeats` — any other still-pending scans for that same guest stay
 * in the queue and get folded back on top of the new baseline the next
 * time the caller re-derives a view (`applyPendingScans`), so nothing is
 * ever double-counted.
 */
export class SyncPendingScansUseCase {
  constructor(
    private readonly store: IOfflineScanStore,
    private readonly transport: ISyncTransport,
  ) {}

  async execute(): Promise<SyncPendingScansResult> {
    const queue = await this.store.getQueue();
    const pending = queue.filter((scan) => scan.status === "pending" || scan.status === "failed");

    let syncedCount = 0;
    let stats: EventStats | null = null;

    for (const scan of pending) {
      await this.store.updateQueuedScan(scan.clientScanId, { status: "syncing" });
      const result = await this.transport.syncScan(scan);

      if (result.outcome === "unauthorized") {
        await this.store.updateQueuedScan(scan.clientScanId, { status: "pending" });
        return { syncedCount, stats, pausedForAuth: true };
      }

      if (result.outcome === "network_error") {
        await this.store.updateQueuedScan(scan.clientScanId, {
          status: "failed",
          attempts: scan.attempts + 1,
          lastError: "network",
        });
        break;
      }

      if (result.outcome === "rejected") {
        await this.store.updateQueuedScan(scan.clientScanId, {
          status: "failed",
          attempts: scan.attempts + 1,
          lastError: result.reason,
        });
        continue;
      }

      await this.store.removeQueuedScan(scan.clientScanId);
      syncedCount += 1;
      stats = result.stats;

      const guests = await this.store.getGuests();
      const updated = guests.map((g) => (g.id === scan.guestId ? { ...g, insideSeats: result.insideSeats } : g));
      await this.store.setGuests(updated);
    }

    return { syncedCount, stats, pausedForAuth: false };
  }
}
