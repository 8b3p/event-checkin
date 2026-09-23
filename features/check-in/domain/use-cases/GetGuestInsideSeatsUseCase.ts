import type { IScanRepository } from "../IScanRepository";

export class GetGuestInsideSeatsUseCase {
  constructor(private readonly scanRepository: IScanRepository) {}

  execute(guestId: number): Promise<number> {
    return this.scanRepository.insideSeatsForGuest(guestId);
  }
}
