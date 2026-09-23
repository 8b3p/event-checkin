import type { Guest } from "../Guest";
import type { IGuestRepository } from "../IGuestRepository";

export class GetGuestByCodeUseCase {
  constructor(private readonly guestRepository: IGuestRepository) {}

  execute(code: string): Promise<Guest | null> {
    return this.guestRepository.getByCode(code);
  }
}
