import type { IScanRepository } from "@/features/check-in/domain/IScanRepository";
import { findDataQualityIssues, type DataQualityReport } from "../dataQuality";

/** Cross-feature through an interface: the issues come from folding the check-in scans (see 04-NEXTJS-ADAPTATION.md). */
export class FindEventDataIssuesUseCase {
  constructor(private readonly scanRepository: IScanRepository) {}

  async execute(eventId: number): Promise<DataQualityReport> {
    return findDataQualityIssues(await this.scanRepository.listGuestAttendance(eventId));
  }
}
