import type { Guest } from "../Guest";
import type { IGuestRepository } from "../IGuestRepository";

export class ListGuestsForEventUseCase {
  constructor(private readonly guestRepository: IGuestRepository) {}

  execute(eventId: number): Promise<Guest[]> {
    return this.guestRepository.listForEvent(eventId);
  }
}
