import type { IGuestRepository } from "../IGuestRepository";

export class DeleteGuestUseCase {
  constructor(private readonly guestRepository: IGuestRepository) {}

  execute(eventId: number, id: number): Promise<void> {
    return this.guestRepository.delete(eventId, id);
  }
}
