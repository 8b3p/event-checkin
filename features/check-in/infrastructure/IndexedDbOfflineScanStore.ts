import type { EventStats, GuestWithStatus } from "../domain/ScanEvent";
import type { QueuedScan } from "../domain/offlineQueue";
import type { IOfflineScanStore, OfflineMeta } from "./IOfflineScanStore";

/**
 * IndexedDB-backed offline cache, one database per event
 * (`checkin-offline-<eventId>`) so a device reused for a different event
 * never mixes the two — see spec §6.3, §6.9. This is thin browser-API
 * glue with no business logic of its own (the actual resolve/commit/merge
 * rules live in `features/check-in/domain/offlineQueue.ts`, which is what
 * carries the unit tests); it can't run under Vitest (no real IndexedDB
 * in Node), so it's exercised through manual QA instead, same as
 * `Scanner.tsx`'s camera integration.
 */

const DB_VERSION = 1;
const GUESTS_STORE = "guests";
const QUEUE_STORE = "scanQueue";
const META_STORE = "meta";
const STATS_KEY = "stats";
const SYNCED_AT_KEY = "lastSyncedAt";

type MetaRow = { key: string; value: unknown };

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function openDb(eventId: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`checkin-offline-${eventId}`, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(GUESTS_STORE)) db.createObjectStore(GUESTS_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: "clientScanId" });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class IndexedDbOfflineScanStore implements IOfflineScanStore {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(eventId: number): Promise<IndexedDbOfflineScanStore> {
    const db = await openDb(eventId);
    return new IndexedDbOfflineScanStore(db);
  }

  async getGuests(): Promise<GuestWithStatus[]> {
    const tx = this.db.transaction(GUESTS_STORE, "readonly");
    const rows = await promisify(tx.objectStore(GUESTS_STORE).getAll());
    return rows as GuestWithStatus[];
  }

  async setGuests(guests: GuestWithStatus[]): Promise<void> {
    const tx = this.db.transaction(GUESTS_STORE, "readwrite");
    const store = tx.objectStore(GUESTS_STORE);
    store.clear();
    for (const guest of guests) store.put(guest);
    await txDone(tx);
  }

  async getQueue(): Promise<QueuedScan[]> {
    const tx = this.db.transaction(QUEUE_STORE, "readonly");
    const rows = await promisify(tx.objectStore(QUEUE_STORE).getAll());
    return (rows as QueuedScan[]).slice().sort((a, b) => a.createdAt - b.createdAt);
  }

  async enqueueScan(scan: QueuedScan): Promise<void> {
    const tx = this.db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).put(scan);
    await txDone(tx);
  }

  async updateQueuedScan(clientScanId: string, patch: Partial<QueuedScan>): Promise<void> {
    const tx = this.db.transaction(QUEUE_STORE, "readwrite");
    const store = tx.objectStore(QUEUE_STORE);
    const existing = (await promisify(store.get(clientScanId))) as QueuedScan | undefined;
    if (existing) store.put({ ...existing, ...patch });
    await txDone(tx);
  }

  async removeQueuedScan(clientScanId: string): Promise<void> {
    const tx = this.db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).delete(clientScanId);
    await txDone(tx);
  }

  async getMeta(): Promise<OfflineMeta> {
    const tx = this.db.transaction(META_STORE, "readonly");
    const row = (await promisify(tx.objectStore(META_STORE).get(SYNCED_AT_KEY))) as MetaRow | undefined;
    return { lastSyncedAt: (row?.value as number | undefined) ?? null };
  }

  async setMeta(meta: OfflineMeta): Promise<void> {
    const tx = this.db.transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).put({ key: SYNCED_AT_KEY, value: meta.lastSyncedAt } satisfies MetaRow);
    await txDone(tx);
  }

  async getStats(): Promise<EventStats | null> {
    const tx = this.db.transaction(META_STORE, "readonly");
    const row = (await promisify(tx.objectStore(META_STORE).get(STATS_KEY))) as MetaRow | undefined;
    return (row?.value as EventStats | undefined) ?? null;
  }

  async setStats(stats: EventStats): Promise<void> {
    const tx = this.db.transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).put({ key: STATS_KEY, value: stats } satisfies MetaRow);
    await txDone(tx);
  }
}
