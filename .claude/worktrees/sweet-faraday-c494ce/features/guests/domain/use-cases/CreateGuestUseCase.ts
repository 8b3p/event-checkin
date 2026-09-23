import { generateCode } from "@/shared/lib/codes";
import type { Guest } from "../Guest";
import type { IGuestRepository } from "../IGuestRepository";

export type AddGuestInput = {
  eventId: number;
  name: string;
  seats: number;
  phone: string | null;
  note: string | null;
};

/** Adds one owner-invited guest, generating its unique code. */
export class CreateGuestUseCase {
  constructor(private readonly guestRepository: IGuestRepository) {}

  execute(input: AddGuestInput): Promise<Guest> {
    return this.guestRepository.create({ ...input, code: generateCode(), source: "invited" });
  }
}
