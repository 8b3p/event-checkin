import type { ScanDirection, ScanEvent, ScanMethod } from "../ScanEvent";
import type { IScanRepository } from "../IScanRepository";

export type RecordScanInput = {
  guestId: number;
  /** The guest's party size — needed to cap how many seats a check-in can admit. */
  partySeats: number;
  direction: ScanDirection;
  method: ScanMethod;
  seats: number;
  scannedBy: string;
  override: boolean;
};

export type RecordScanResult =
  | { outcome: "recorded"; scan: ScanEvent; insideSeats: number }
  | { outcome: "blocked"; reason: "already_full" | "not_inside"; insideSeats: number };

/**
 * Writes one scan row, after a seats-aware guard: checking in is capped at the
 * party's remaining seats, checking out is capped at the seats currently
 * inside, and both are refused outright (not just capped to zero) once the
 * party is fully in/out — unless `override` is set, which bypasses the guard
 * entirely and records exactly the requested seats. See spec §7.
 */
export class RecordScanUseCase {
  constructor(private readonly scanRepository: IScanRepository) {}

  async execute(input: RecordScanInput): Promise<RecordScanResult> {
    const insideSeats = await this.scanRepository.insideSeatsForGuest(input.guestId);

    if (input.direction === "in") {
      if (!input.override && insideSeats >= input.partySeats) {
        return { outcome: "blocked", reason: "already_full", insideSeats };
      }
      const seats = input.override ? input.seats : Math.min(input.seats, input.partySeats - insideSeats);
      const scan = await this.scanRepository.record({ ...input, seats });
      return { outcome: "recorded", scan, insideSeats: insideSeats + seats };
    }

    if (!input.override && insideSeats <= 0) {
      return { outcome: "blocked", reason: "not_inside", insideSeats };
    }
    const seats = input.override ? input.seats : Math.min(input.seats, insideSeats);
    const scan = await this.scanRepository.record({ ...input, seats });
    return { outcome: "recorded", scan, insideSeats: insideSeats - seats };
  }
}
