import { generateCode } from "@/shared/lib/codes";
import type { Guest } from "@/features/guests/domain/Guest";
import type { IGuestRepository } from "@/features/guests/domain/IGuestRepository";
import type { IScanRepository } from "../IScanRepository";

export type AddWalkInGuestInput = { eventId: number; name: string; seats: number; scannedBy: string };
export type AddWalkInGuestResult = { guest: Guest; insideSeats: number };

/**
 * Cross-feature domain dependency (guests + check-in), through repository
 * interfaces — same pattern as AuthenticateDoorUseCase. See spec §7: a
 * walk-in gets a real guest row (so they can be given a QR later if the
 * owner wants) and is immediately checked in, both traceable to the door
 * session that added them.
 */
export class AddWalkInGuestUseCase {
  constructor(
    private readonly guestRepository: IGuestRepository,
    private readonly scanRepository: IScanRepository,
  ) {}

  async execute(input: AddWalkInGuestInput): Promise<AddWalkInGuestResult> {
    const guest = await this.guestRepository.create({
      eventId: input.eventId,
      name: input.name,
      seats: input.seats,
      phone: null,
      note: null,
      code: generateCode(),
      source: "walk_in",
    });

    await this.scanRepository.record({
      guestId: guest.id,
      direction: "in",
      method: "manual",
      seats: input.seats,
      scannedBy: input.scannedBy,
      override: false,
    });

    return { guest, insideSeats: input.seats };
  }
}
