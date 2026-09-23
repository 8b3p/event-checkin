import type { RecentScan } from "../ScanEvent";
import type { IScanRepository } from "../IScanRepository";

export class GetRecentScansUseCase {
  constructor(private readonly scanRepository: IScanRepository) {}

  execute(eventId: number, limit?: number): Promise<RecentScan[]> {
    return this.scanRepository.recentScans(eventId, limit);
  }
}
