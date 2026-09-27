import { describe, expect, it } from "vitest";
import type { EventStats, GuestWithStatus } from "../ScanEvent";
import type { IOfflineScanStore, OfflineMeta } from "../IOfflineScanStore";
import type { ISyncTransport, SyncTransportResult } from "../ISyncTransport";
import type { QueuedScan } from "../offlineQueue";
import { applyPendingScans } from "../offlineQueue";
import { SyncPendingScansUseCase } from "./SyncPendingScansUseCase";

class FakeOfflineScanStore implements IOfflineScanStore {
  guests: GuestWithStatus[] = [];
  queue: QueuedScan[] = [];
  meta: OfflineMeta = { lastSyncedAt: null };
  stats: EventStats | null = null;

  async getGuests() {
    return this.guests;
  }
  async setGuests(guests: GuestWithStatus[]) {
    this.guests = guests;
  }
  async getQueue() {
    return this.queue;
  }
  async enqueueScan(scan: QueuedScan) {
    this.queue.push(scan);
  }
  async updateQueuedScan(clientScanId: string, patch: Partial<QueuedScan>) {
    this.queue = this.queue.map((s) => (s.clientScanId === clientScanId ? { ...s, ...patch } : s));
  }
  async removeQueuedScan(clientScanId: string) {
    this.queue = this.queue.filter((s) => s.clientScanId !== clientScanId);
  }
  async getMeta() {
    return this.meta;
  }
  async setMeta(meta: OfflineMeta) {
    this.meta = meta;
  }
  async getStats() {
    return this.stats;
  }
  async setStats(stats: EventStats) {
    this.stats = stats;
  }
}

class ScriptedTransport implements ISyncTransport {
  private calls = 0;
  constructor(private readonly script: (scan: QueuedScan, call: number) => SyncTransportResult) {}
  async syncScan(scan: QueuedScan): Promise<SyncTransportResult> {
    this.calls += 1;
    return this.script(scan, this.calls);
  }
}

function guest(overrides: Partial<GuestWithStatus> = {}): GuestWithStatus {
  return {
    id: 1,
    name: "Sara Ahmed",
    seats: 4,
    phone: null,
    note: null,
    code: "ABCXYZ01",
    source: "invited",
    insideSeats: 0,
    ...overrides,
  };
}

function queuedScan(overrides: Partial<QueuedScan> = {}): QueuedScan {
  return {
    clientScanId: "scan-1",
    guestId: 1,
    direction: "in",
    method: "qr",
    seats: 2,
    override: false,
    createdAt: 0,
    status: "pending",
    attempts: 0,
    ...overrides,
  };
}

const STATS: EventStats = { invites: 1, seatsInvited: 4, guestsInside: 1, seatsInside: 2 };

describe("SyncPendingScansUseCase", () => {
  it("syncs a pending scan, removes it from the queue, and updates the guest baseline", async () => {
    const store = new FakeOfflineScanStore();
    store.guests = [guest({ insideSeats: 0 })];
    store.queue = [queuedScan()];

    const transport = new ScriptedTransport(() => ({ outcome: "synced", insideSeats: 2, stats: STATS }));
    const result = await new SyncPendingScansUseCase(store, transport).execute();

    expect(result).toEqual({ syncedCount: 1, stats: STATS, pausedForAuth: false });
    expect(store.queue).toHaveLength(0);
    expect(store.guests[0].insideSeats).toBe(2);
  });

  it("stops the pass on a network error, marking that item failed", async () => {
    const store = new FakeOfflineScanStore();
    store.guests = [guest(), guest({ id: 2 })];
    store.queue = [queuedScan({ clientScanId: "a", guestId: 1 }), queuedScan({ clientScanId: "b", guestId: 2 })];

    const transport = new ScriptedTransport(() => ({ outcome: "network_error" }));
    const result = await new SyncPendingScansUseCase(store, transport).execute();

    expect(result.syncedCount).toBe(0);
    expect(store.queue).toHaveLength(2);
    expect(store.queue[0]).toMatchObject({ status: "failed", attempts: 1, lastError: "network" });
    // The second item was never attempted this pass.
    expect(store.queue[1]).toMatchObject({ status: "pending", attempts: 0 });
  });

  it("pauses for auth without dropping the queue on a 401", async () => {
    const store = new FakeOfflineScanStore();
    store.guests = [guest()];
    store.queue = [queuedScan()];

    const transport = new ScriptedTransport(() => ({ outcome: "unauthorized" }));
    const result = await new SyncPendingScansUseCase(store, transport).execute();

    expect(result.pausedForAuth).toBe(true);
    expect(store.queue).toHaveLength(1);
    expect(store.queue[0].status).toBe("pending");
  });

  it("marks a rejected item failed but continues past it to the next item", async () => {
    const store = new FakeOfflineScanStore();
    store.guests = [guest(), guest({ id: 2 })];
    store.queue = [queuedScan({ clientScanId: "a", guestId: 1 }), queuedScan({ clientScanId: "b", guestId: 2 })];

    const transport = new ScriptedTransport((scan) =>
      scan.clientScanId === "a"
        ? { outcome: "rejected", reason: "guest not found" }
        : { outcome: "synced", insideSeats: 2, stats: STATS },
    );
    const result = await new SyncPendingScansUseCase(store, transport).execute();

    expect(result.syncedCount).toBe(1);
    expect(store.queue).toHaveLength(1);
    expect(store.queue[0]).toMatchObject({ clientScanId: "a", status: "failed", lastError: "guest not found" });
  });

  it("retries a previously failed item on the next pass", async () => {
    const store = new FakeOfflineScanStore();
    store.guests = [guest()];
    store.queue = [queuedScan({ status: "failed", attempts: 1 })];

    const transport = new ScriptedTransport(() => ({ outcome: "synced", insideSeats: 2, stats: STATS }));
    const result = await new SyncPendingScansUseCase(store, transport).execute();

    expect(result.syncedCount).toBe(1);
    expect(store.queue).toHaveLength(0);
  });

  it("never double-counts a still-pending scan for the same guest after another one syncs", async () => {
    // Two check-ins queued for the same partially-arriving party, both
    // still pending. Only the first one is delivered this pass.
    const store = new FakeOfflineScanStore();
    store.guests = [guest({ seats: 4, insideSeats: 0 })];
    store.queue = [
      queuedScan({ clientScanId: "a", guestId: 1, direction: "in", seats: 2 }),
      queuedScan({ clientScanId: "b", guestId: 1, direction: "in", seats: 1 }),
    ];

    const transport = new ScriptedTransport((scan) =>
      scan.clientScanId === "a"
        ? { outcome: "synced", insideSeats: 2, stats: STATS }
        : { outcome: "network_error" },
    );
    await new SyncPendingScansUseCase(store, transport).execute();

    // Baseline now reflects the synced scan; the still-pending "b" scan
    // must fold on top of it, not on top of the pre-sync baseline.
    const view = applyPendingScans(store.guests, store.queue);
    expect(view[0].insideSeats).toBe(3);
  });

  it("does nothing when the queue is empty", async () => {
    const store = new FakeOfflineScanStore();
    const transport = new ScriptedTransport(() => ({ outcome: "synced", insideSeats: 0, stats: STATS }));
    const result = await new SyncPendingScansUseCase(store, transport).execute();
    expect(result).toEqual({ syncedCount: 0, stats: null, pausedForAuth: false });
  });
});
