import type { Guest } from "../Guest";
import type { IGuestRepository } from "../IGuestRepository";

export class GetGuestUseCase {
  constructor(private readonly guestRepository: IGuestRepository) {}

  execute(eventId: number, id: number): Promise<Guest | null> {
    return this.guestRepository.getById(eventId, id);
  }
}
