import type { GuestWithStatus } from "../ScanEvent";
import type { IScanRepository } from "../IScanRepository";

export class ListGuestsWithStatusUseCase {
  constructor(private readonly scanRepository: IScanRepository) {}

  execute(eventId: number, query?: string): Promise<GuestWithStatus[]> {
    return this.scanRepository.listGuestsWithStatus(eventId, query);
  }
}
