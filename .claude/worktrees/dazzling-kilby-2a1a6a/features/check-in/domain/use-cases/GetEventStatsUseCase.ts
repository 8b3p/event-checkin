import type { EventStats } from "../ScanEvent";
import type { IScanRepository } from "../IScanRepository";

export class GetEventStatsUseCase {
  constructor(private readonly scanRepository: IScanRepository) {}

  execute(eventId: number): Promise<EventStats> {
    return this.scanRepository.eventStats(eventId);
  }
}
