import type { EventStats } from "./ScanEvent";
import type { QueuedScan } from "./offlineQueue";

export type SyncTransportResult =
  | { outcome: "synced"; insideSeats: number; stats: EventStats }
  | { outcome: "unauthorized" }
  /** The request never reached the server (offline, timed out, DNS, …) —
   * worth retrying; the whole pass stops here since every other queued
   * item will fail the same way right now. */
  | { outcome: "network_error" }
  /** The server was reached and refused this specific scan (e.g. the
   * guest no longer exists) — not a network-wide problem, so other queued
   * items still get a chance this pass. */
  | { outcome: "rejected"; reason: string };

/** The network boundary for syncing one queued scan — implemented for
 * real against `/api/checkin`'s PATCH (with `clientScanId`); faked in
 * tests so `SyncPendingScansUseCase`'s orchestration can be verified
 * without a network. */
export interface ISyncTransport {
  syncScan(scan: QueuedScan): Promise<SyncTransportResult>;
}
