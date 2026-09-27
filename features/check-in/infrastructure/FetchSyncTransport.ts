import type { CommitResult } from "@/app/api/checkin/route";
import type { ISyncTransport, SyncTransportResult } from "../domain/ISyncTransport";
import type { QueuedScan } from "../domain/offlineQueue";

/** Real network boundary for `SyncPendingScansUseCase`: a `clientScanId`
 * on the PATCH body routes the request through `/api/checkin`'s
 * unconditional sync path instead of the live interactive guard. */
export class FetchSyncTransport implements ISyncTransport {
  async syncScan(scan: QueuedScan): Promise<SyncTransportResult> {
    let response: Response;
    try {
      response = await fetch("/api/checkin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestId: scan.guestId,
          direction: scan.direction,
          seats: scan.seats,
          method: scan.method,
          override: scan.override,
          clientScanId: scan.clientScanId,
        }),
      });
    } catch {
      return { outcome: "network_error" };
    }

    if (response.status === 401) return { outcome: "unauthorized" };
    if (!response.ok) return { outcome: "rejected", reason: `http_${response.status}` };

    const data = (await response.json()) as CommitResult;
    if (data.status === "recorded") return { outcome: "synced", insideSeats: data.insideSeats, stats: data.stats };
    if (data.status === "unauthorized") return { outcome: "unauthorized" };
    // "not_found" / "blocked" aren't expected on the sync path (a
    // clientScanId always takes the unconditional branch) — handled
    // defensively in case the guest was deleted between commit and sync.
    return { outcome: "rejected", reason: data.status };
  }
}
