import { decideScanOutcome } from "./decideScanOutcome";
import type { GuestWithStatus, ScanDirection, ScanMethod } from "./ScanEvent";
import { normaliseScan } from "@/shared/lib/code-format";

export type QueuedScanStatus = "pending" | "syncing" | "synced" | "failed";

/** A scan committed locally but not yet confirmed by the server — see
 * docs/superpowers/specs/2026-09-26-offline-first-scan-and-ux-polish.md §6.3.
 * `clientScanId` is the idempotency key a sync attempt (and any retry of
 * it) carries, so the same physical tap can never be recorded twice. */
export type QueuedScan = {
  clientScanId: string;
  guestId: number;
  direction: ScanDirection;
  method: ScanMethod;
  seats: number;
  /** Staff's own override decision at the moment this was committed
   * locally — carried through to the sync request as-is, since the sync
   * endpoint never re-derives it (spec §6.8). */
  override: boolean;
  createdAt: number;
  status: QueuedScanStatus;
  attempts: number;
  lastError?: string;
};

/**
 * A guest's `insideSeats` as last known from the server, adjusted by any
 * of this device's own scans that haven't synced yet. This is the single
 * place "what does the door screen show right now" is computed from — the
 * same fold `foldGuestBalances` does server-side, applied to local deltas
 * on top of a cached snapshot instead of the full scan_events history.
 */
export function applyPendingScans(guests: GuestWithStatus[], queue: QueuedScan[]): GuestWithStatus[] {
  const pendingByGuest = new Map<number, QueuedScan[]>();
  for (const scan of queue) {
    if (scan.status === "synced") continue;
    const list = pendingByGuest.get(scan.guestId);
    if (list) list.push(scan);
    else pendingByGuest.set(scan.guestId, [scan]);
  }
  if (pendingByGuest.size === 0) return guests;

  return guests.map((guest) => {
    const pending = pendingByGuest.get(guest.id);
    if (!pending) return guest;
    const insideSeats = pending.reduce(
      (seats, scan) => (scan.direction === "in" ? seats + scan.seats : seats - scan.seats),
      guest.insideSeats,
    );
    return { ...guest, insideSeats };
  });
}

/** Finds the guest a scanned/typed code refers to. A real QR encodes the
 * guest's full invite URL, not the bare code (see `inviteUrl`), and manual
 * entry may come in lowercase — `normaliseScan` reduces either to the
 * stored form before matching, mirroring the pre-offline server-side
 * lookup in `POST /api/checkin`. */
export function findGuestByScannedCode(guests: GuestWithStatus[], rawCode: string): GuestWithStatus | null {
  const code = normaliseScan(rawCode);
  if (!code) return null;
  return guests.find((g) => g.code === code) ?? null;
}

export type LocalResolveResult =
  | { status: "unknown" }
  | {
      status: "resolved";
      guest: GuestWithStatus;
      canCheckIn: { defaultSeats: number } | null;
      canCheckOut: { defaultSeats: number } | null;
    };

/** The resolve step, done entirely against the local (pending-adjusted)
 * guest list — no network round trip. Mirrors what `POST /api/checkin`
 * computes today; see spec §6.4. */
export function resolveGuestStatus(guest: GuestWithStatus | null): LocalResolveResult {
  if (!guest) return { status: "unknown" };

  const canCheckIn = guest.insideSeats < guest.seats ? { defaultSeats: guest.seats - guest.insideSeats } : null;
  const canCheckOut = guest.insideSeats > 0 ? { defaultSeats: guest.insideSeats } : null;

  return { status: "resolved", guest, canCheckIn, canCheckOut };
}

export type LocalCommitResult =
  | { status: "blocked"; reason: "already_full" | "not_inside"; insideSeats: number }
  | { status: "recorded"; insideSeats: number; queuedScan: QueuedScan };

/** The commit step, done entirely locally: runs the same seats-aware guard
 * (`decideScanOutcome`) the server runs, against the guest's current
 * pending-adjusted `insideSeats`, and produces a `QueuedScan` to enqueue —
 * no network round trip on the critical path. See spec §6.5. */
export function commitScanLocally(
  guest: GuestWithStatus,
  direction: ScanDirection,
  method: ScanMethod,
  seats: number,
  override: boolean,
  makeClientScanId: () => string,
  now: () => number,
): LocalCommitResult {
  const decision = decideScanOutcome({
    insideSeats: guest.insideSeats,
    partySeats: guest.seats,
    direction,
    seats,
    override,
  });

  if (decision.outcome === "blocked") {
    return { status: "blocked", reason: decision.reason, insideSeats: decision.insideSeats };
  }

  const queuedScan: QueuedScan = {
    clientScanId: makeClientScanId(),
    guestId: guest.id,
    direction,
    method,
    seats: decision.seats,
    override,
    createdAt: now(),
    status: "pending",
    attempts: 0,
  };

  return { status: "recorded", insideSeats: decision.insideSeats, queuedScan };
}
