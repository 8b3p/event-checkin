import type { ScanDirection } from "./ScanEvent";

export type ScanForBalance = { guestId: number; direction: ScanDirection; seats: number };

/**
 * Folds a list of scan rows into a per-guest "seats currently inside"
 * balance. `in` adds seats, `out` subtracts them — a guest is inside
 * whenever their balance is greater than zero. This is the single source
 * of truth for derived status; every status shown anywhere in the app
 * traces back to this function. See spec §4.
 */
export function foldGuestBalances(scans: ScanForBalance[]): Map<number, number> {
  const balances = new Map<number, number>();
  for (const scan of scans) {
    const delta = scan.direction === "in" ? scan.seats : -scan.seats;
    balances.set(scan.guestId, (balances.get(scan.guestId) ?? 0) + delta);
  }
  return balances;
}
