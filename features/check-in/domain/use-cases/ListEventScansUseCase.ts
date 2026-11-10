import type { EventScan } from "../ScanEvent";
import type { IScanRepository } from "../IScanRepository";

export class ListEventScansUseCase {
  constructor(private readonly scanRepository: IScanRepository) {}

  execute(eventId: number): Promise<EventScan[]> {
    return this.scanRepository.listScansForEvent(eventId);
  }
}
