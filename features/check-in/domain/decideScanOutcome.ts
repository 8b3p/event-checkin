import type { ScanDirection } from "./ScanEvent";

export type DecideScanOutcomeInput = {
  /** Seats currently inside for this guest, before this scan. */
  insideSeats: number;
  /** The guest's party size — caps how many seats a check-in can admit. */
  partySeats: number;
  direction: ScanDirection;
  /** Seats staff asked to move — clamped unless `override` is set. */
  seats: number;
  override: boolean;
};

export type DecideScanOutcomeResult =
  | { outcome: "recorded"; seats: number; insideSeats: number }
  | { outcome: "blocked"; reason: "already_full" | "not_inside"; insideSeats: number };

/**
 * The seats-aware in/out guard, as a pure function with no repository
 * dependency: checking in is capped at the party's remaining seats,
 * checking out is capped at the seats currently inside, and both are
 * refused outright (not just capped to zero) once the party is fully
 * in/out — unless `override` is set, which bypasses the guard entirely
 * and moves exactly the requested seats. See spec §7.
 *
 * Pulled out of `RecordScanUseCase` so the same decision can run
 * server-side (there) and client-side against a locally cached
 * `insideSeats`, without the two ever drifting apart — see
 * docs/superpowers/specs/2026-09-26-offline-first-scan-and-ux-polish.md §6.5.
 */
export function decideScanOutcome(input: DecideScanOutcomeInput): DecideScanOutcomeResult {
  const { insideSeats, partySeats, direction, seats, override } = input;

  if (direction === "in") {
    if (!override && insideSeats >= partySeats) {
      return { outcome: "blocked", reason: "already_full", insideSeats };
    }
    const moved = override ? seats : Math.min(seats, partySeats - insideSeats);
    return { outcome: "recorded", seats: moved, insideSeats: insideSeats + moved };
  }

  if (!override && insideSeats <= 0) {
    return { outcome: "blocked", reason: "not_inside", insideSeats };
  }
  const moved = override ? seats : Math.min(seats, insideSeats);
  return { outcome: "recorded", seats: moved, insideSeats: insideSeats - moved };
}
