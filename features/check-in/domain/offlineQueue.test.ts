import { describe, expect, it } from "vitest";
import { applyPendingScans, commitScanLocally, resolveGuestStatus, type QueuedScan } from "./offlineQueue";
import type { GuestWithStatus } from "./ScanEvent";

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
    seats: 1,
    createdAt: 0,
    status: "pending",
    attempts: 0,
    ...overrides,
  };
}

describe("applyPendingScans", () => {
  it("returns the guests unchanged when the queue is empty", () => {
    const guests = [guest()];
    expect(applyPendingScans(guests, [])).toBe(guests);
  });

  it("adds seats for a pending check-in scan", () => {
    const guests = [guest({ id: 1, insideSeats: 0 })];
    const result = applyPendingScans(guests, [queuedScan({ guestId: 1, direction: "in", seats: 2 })]);
    expect(result[0].insideSeats).toBe(2);
  });

  it("subtracts seats for a pending check-out scan", () => {
    const guests = [guest({ id: 1, insideSeats: 3 })];
    const result = applyPendingScans(guests, [queuedScan({ guestId: 1, direction: "out", seats: 2 })]);
    expect(result[0].insideSeats).toBe(1);
  });

  it("folds multiple pending scans for the same guest in order", () => {
    const guests = [guest({ id: 1, insideSeats: 0 })];
    const queue = [
      queuedScan({ clientScanId: "a", guestId: 1, direction: "in", seats: 4 }),
      queuedScan({ clientScanId: "b", guestId: 1, direction: "out", seats: 1 }),
    ];
    expect(applyPendingScans(guests, queue)[0].insideSeats).toBe(3);
  });

  it("ignores scans already marked synced", () => {
    const guests = [guest({ id: 1, insideSeats: 0 })];
    const queue = [queuedScan({ guestId: 1, direction: "in", seats: 2, status: "synced" })];
    expect(applyPendingScans(guests, queue)[0].insideSeats).toBe(0);
  });

  it("leaves other guests untouched", () => {
    const guests = [guest({ id: 1, insideSeats: 0 }), guest({ id: 2, insideSeats: 1 })];
    const result = applyPendingScans(guests, [queuedScan({ guestId: 1, direction: "in", seats: 2 })]);
    expect(result[1]).toEqual(guests[1]);
  });
});

describe("resolveGuestStatus", () => {
  it("reports unknown for a null guest (code not found locally)", () => {
    expect(resolveGuestStatus(null)).toEqual({ status: "unknown" });
  });

  it("offers check-in only when fully outside", () => {
    const result = resolveGuestStatus(guest({ seats: 4, insideSeats: 0 }));
    expect(result).toMatchObject({
      status: "resolved",
      canCheckIn: { defaultSeats: 4 },
      canCheckOut: null,
    });
  });

  it("offers check-out only when fully inside", () => {
    const result = resolveGuestStatus(guest({ seats: 4, insideSeats: 4 }));
    expect(result).toMatchObject({ canCheckIn: null, canCheckOut: { defaultSeats: 4 } });
  });

  it("offers both when a party is partially arrived", () => {
    const result = resolveGuestStatus(guest({ seats: 4, insideSeats: 2 }));
    expect(result).toMatchObject({ canCheckIn: { defaultSeats: 2 }, canCheckOut: { defaultSeats: 2 } });
  });
});

describe("commitScanLocally", () => {
  const makeId = () => "generated-id";
  const now = () => 1234;

  it("produces a queued scan for an allowed check-in", () => {
    const result = commitScanLocally(guest({ seats: 4, insideSeats: 0 }), "in", "qr", 4, false, makeId, now);
    expect(result).toEqual({
      status: "recorded",
      insideSeats: 4,
      queuedScan: {
        clientScanId: "generated-id",
        guestId: 1,
        direction: "in",
        method: "qr",
        seats: 4,
        createdAt: 1234,
        status: "pending",
        attempts: 0,
      },
    });
  });

  it("clamps seats to what the guard allows", () => {
    const result = commitScanLocally(guest({ seats: 4, insideSeats: 2 }), "in", "manual", 99, false, makeId, now);
    expect(result).toMatchObject({ status: "recorded", queuedScan: { seats: 2 } });
  });

  it("blocks without enqueueing when the party is already fully inside", () => {
    const result = commitScanLocally(guest({ seats: 2, insideSeats: 2 }), "in", "qr", 2, false, makeId, now);
    expect(result).toEqual({ status: "blocked", reason: "already_full", insideSeats: 2 });
  });

  it("records unconditionally when overridden", () => {
    const result = commitScanLocally(guest({ seats: 2, insideSeats: 2 }), "in", "qr", 2, true, makeId, now);
    expect(result).toMatchObject({ status: "recorded", insideSeats: 4, queuedScan: { seats: 2 } });
  });
});
