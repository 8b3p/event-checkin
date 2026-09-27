import type { ScanDirection, ScanMethod } from "../ScanEvent";
import type { IScanRepository } from "../IScanRepository";

export type RecordSyncedScanInput = {
  guestId: number;
  direction: ScanDirection;
  method: ScanMethod;
  /** Seats the client already decided to move — not re-clamped here. */
  seats: number;
  scannedBy: string;
  /** The client's own override decision at the moment it committed this
   * scan locally — recorded as-is; this use-case doesn't infer it. */
  override: boolean;
  clientScanId: string;
};

export type RecordSyncedScanResult = { insideSeats: number };

/**
 * Records a scan the device already decided on while offline —
 * unconditionally, with no seats-aware guard re-run. See
 * docs/superpowers/specs/2026-09-26-offline-first-scan-and-ux-polish.md §6.8:
 * a queued scan is a decision staff already acted on in front of a guest;
 * re-validating it against newer server state and rejecting it after the
 * fact would silently disagree with an action already taken in the
 * physical world. Idempotent by `clientScanId` — a repeat delivery of the
 * same key (a retry, a duplicate sync tick) is a pure no-op that returns
 * the already-recorded result instead of inserting a second row.
 */
export class RecordSyncedScanUseCase {
  constructor(private readonly scanRepository: IScanRepository) {}

  async execute(input: RecordSyncedScanInput): Promise<RecordSyncedScanResult> {
    const existing = await this.scanRepository.findByClientScanId(input.clientScanId);
    if (existing) {
      return { insideSeats: await this.scanRepository.insideSeatsForGuest(existing.guestId) };
    }

    await this.scanRepository.record({
      guestId: input.guestId,
      direction: input.direction,
      method: input.method,
      seats: input.seats,
      scannedBy: input.scannedBy,
      override: input.override,
      clientScanId: input.clientScanId,
    });

    return { insideSeats: await this.scanRepository.insideSeatsForGuest(input.guestId) };
  }
}
