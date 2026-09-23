import type { UpdateGuestInput } from "../Guest";
import type { IGuestRepository } from "../IGuestRepository";

export class UpdateGuestUseCase {
  constructor(private readonly guestRepository: IGuestRepository) {}

  execute(eventId: number, id: number, input: UpdateGuestInput): Promise<void> {
    return this.guestRepository.update(eventId, id, input);
  }
}
