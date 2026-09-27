"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeStatsFromGuests } from "@/features/check-in/domain/computeStatsFromGuests";
import { nextBackoffDelayMs } from "@/features/check-in/domain/backoffDelay";
import {
  applyPendingScans,
  commitScanLocally,
  resolveGuestStatus,
  type LocalCommitResult,
  type LocalResolveResult,
  type QueuedScan,
} from "@/features/check-in/domain/offlineQueue";
import type { EventStats, GuestWithStatus, ScanDirection, ScanMethod } from "@/features/check-in/domain/ScanEvent";
import { SyncPendingScansUseCase } from "@/features/check-in/domain/use-cases/SyncPendingScansUseCase";
import { FetchSyncTransport } from "@/features/check-in/infrastructure/FetchSyncTransport";
import { IndexedDbOfflineScanStore } from "@/features/check-in/infrastructure/IndexedDbOfflineScanStore";
import type { IOfflineScanStore } from "@/features/check-in/domain/IOfflineScanStore";

/** How often the sync loop retries while the queue is non-empty and
 * nothing is actively failing — spec §6.6's "every 8-10s". */
const STEADY_TICK_MS = 8000;

export type SyncStatus =
  | { kind: "synced" }
  | { kind: "pending"; count: number }
  | { kind: "offline"; count: number }
  | { kind: "auth-paused"; count: number };

export type OfflineSyncApi = {
  ready: boolean;
  guests: GuestWithStatus[];
  stats: EventStats;
  syncStatus: SyncStatus;
  resolveByCode(code: string): LocalResolveResult;
  resolveGuest(guestId: number): LocalResolveResult;
  commit(
    guest: GuestWithStatus,
    direction: ScanDirection,
    method: ScanMethod,
    seats: number,
    override: boolean,
  ): LocalCommitResult;
  /** For a walk-in guest just created via the existing online-only
   * server action — adds it to the local cache so it resolves like any
   * other guest from then on (walk-in *creation* itself stays online-only;
   * see spec — this plan only makes scanning existing guests offline-first). */
  addGuestToCache(guest: GuestWithStatus): void;
};

function makeClientScanId(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function useOfflineSync(eventId: number, initialGuests: GuestWithStatus[]): OfflineSyncApi {
  const [ready, setReady] = useState(false);
  const [baseline, setBaseline] = useState<GuestWithStatus[]>(initialGuests);
  const [queue, setQueue] = useState<QueuedScan[]>([]);
  const [online, setOnline] = useState(true);
  const [pausedForAuth, setPausedForAuth] = useState(false);

  const storeRef = useRef<IOfflineScanStore | null>(null);
  const transportRef = useRef(new FetchSyncTransport());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failureStreakRef = useRef(0);

  const guests = useMemo(() => applyPendingScans(baseline, queue), [baseline, queue]);
  const stats = useMemo(() => computeStatsFromGuests(guests), [guests]);
  const pendingCount = useMemo(() => queue.filter((s) => s.status !== "synced").length, [queue]);

  // `scheduleSync` and `runSync` are mutually recursive. Neither closes
  // over anything that changes across renders (only stable setState
  // setters and refs), so the closure each captures on first render stays
  // correct for the component's whole lifetime — no stale-closure risk
  // despite the empty dependency arrays.
  const scheduleSync = useCallback((delayMs: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void runSync(), delayMs);
  }, []);

  const runSync = useCallback(async () => {
    const store = storeRef.current;
    if (!store || !navigator.onLine) return;

    const result = await new SyncPendingScansUseCase(store, transportRef.current).execute();

    if (result.pausedForAuth) {
      setPausedForAuth(true);
      const [freshGuests, freshQueue] = await Promise.all([store.getGuests(), store.getQueue()]);
      setBaseline(freshGuests);
      setQueue(freshQueue);
      return; // resumed by the next enqueue or `online` event, not a timer
    }
    setPausedForAuth(false);

    const [freshGuests, freshQueue] = await Promise.all([store.getGuests(), store.getQueue()]);
    setBaseline(freshGuests);
    setQueue(freshQueue);

    const stillPending = freshQueue.filter((s) => s.status !== "synced");
    if (stillPending.length === 0) {
      failureStreakRef.current = 0;
      return;
    }

    const stillFailing = stillPending.some((s) => s.status === "failed");
    failureStreakRef.current = stillFailing ? failureStreakRef.current + 1 : 0;
    scheduleSync(stillFailing ? nextBackoffDelayMs(failureStreakRef.current) : STEADY_TICK_MS);
  }, [scheduleSync]);

  // Open + seed the store on mount (and if the event changes, though in
  // practice one Scanner instance lives for one event for its whole session).
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const store = await IndexedDbOfflineScanStore.open(eventId);
      if (cancelled) return;
      storeRef.current = store;

      // The page's own server-rendered load is already a fresh snapshot —
      // equivalent to a GET /api/checkin — so it becomes the new baseline.
      // Any scans this device already had queued (e.g. from a session that
      // never finished syncing) are kept, not cleared.
      await store.setGuests(initialGuests);
      const existingQueue = await store.getQueue();
      if (cancelled) return;

      setBaseline(initialGuests);
      setQueue(existingQueue);
      setOnline(navigator.onLine);
      setReady(true);

      if (navigator.onLine && existingQueue.some((s) => s.status !== "synced")) void runSync();
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // Intentionally only re-runs if the event id changes — initialGuests is
    // a snapshot from the page load that seeded this effect once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // Refresh from the server and re-attempt sync whenever connectivity returns.
  useEffect(() => {
    async function refreshSnapshot() {
      const store = storeRef.current;
      if (!store) return;
      try {
        const response = await fetch("/api/checkin", { method: "GET" });
        if (response.status === 401) return; // interactive paths handle redirecting to /door
        if (!response.ok) return;
        const data = (await response.json()) as { status: string; guests?: GuestWithStatus[] };
        if (data.status === "ok" && data.guests) {
          await store.setGuests(data.guests);
          setBaseline(data.guests);
        }
      } catch {
        // Best-effort refresh — the local cache just stays as it was.
      }
    }

    function handleOnline() {
      setOnline(true);
      void refreshSnapshot().then(() => void runSync());
    }
    function handleOffline() {
      setOnline(false);
    }
    function handleVisibility() {
      if (document.visibilityState === "visible" && navigator.onLine) void runSync();
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [runSync]);

  const resolveByCode = useCallback(
    (code: string): LocalResolveResult => {
      const guest = guests.find((g) => g.code === code) ?? null;
      return resolveGuestStatus(guest);
    },
    [guests],
  );

  const resolveGuest = useCallback(
    (guestId: number): LocalResolveResult => {
      const guest = guests.find((g) => g.id === guestId) ?? null;
      return resolveGuestStatus(guest);
    },
    [guests],
  );

  const commit = useCallback(
    (guest: GuestWithStatus, direction: ScanDirection, method: ScanMethod, seats: number, override: boolean): LocalCommitResult => {
      const result = commitScanLocally(guest, direction, method, seats, override, makeClientScanId, Date.now);

      if (result.status === "recorded") {
        setQueue((rows) => [...rows, result.queuedScan]);
        void storeRef.current?.enqueueScan(result.queuedScan).then(() => {
          if (navigator.onLine) void runSync();
        });
      }

      return result;
    },
    [runSync],
  );

  const addGuestToCache = useCallback((guest: GuestWithStatus) => {
    setBaseline((rows) => [guest, ...rows]);
    void storeRef.current?.getGuests().then((rows) => storeRef.current?.setGuests([guest, ...rows]));
  }, []);

  const syncStatus: SyncStatus = pausedForAuth
    ? { kind: "auth-paused", count: pendingCount }
    : !online
      ? { kind: "offline", count: pendingCount }
      : pendingCount > 0
        ? { kind: "pending", count: pendingCount }
        : { kind: "synced" };

  return { ready, guests, stats, syncStatus, resolveByCode, resolveGuest, commit, addGuestToCache };
}
