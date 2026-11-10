import type { IScanRepository } from "@/features/check-in/domain/IScanRepository";
import type { IEventRepository } from "@/features/events/domain/IEventRepository";
import { densifyArrivals, peakArrival } from "../densifyArrivals";
import type { EventReport } from "../EventReport";
import { summarizeAttendance } from "../summarizeAttendance";
import { summarizeScanLog } from "../summarizeScanLog";

/**
 * Cross-feature domain dependency, through the events and check-in
 * repository interfaces — and only the reads it needs, so the report
 * doesn't care what else those repositories grow.
 */
export class GetEventReportUseCase {
  constructor(
    private readonly eventRepository: Pick<IEventRepository, "getById">,
    private readonly scanRepository: Pick<IScanRepository, "listGuestAttendance" | "listScansForEvent" | "arrivalBuckets">,
  ) {}

  async execute(eventId: number): Promise<EventReport | null> {
    const event = await this.eventRepository.getById(eventId);
    if (!event) return null;

    const [guests, scans, buckets] = await Promise.all([
      this.scanRepository.listGuestAttendance(eventId),
      this.scanRepository.listScansForEvent(eventId),
      this.scanRepository.arrivalBuckets(eventId),
    ]);
    const arrivals = densifyArrivals(buckets);

    return {
      event,
      summary: summarizeAttendance(guests),
      guests,
      arrivals,
      peak: peakArrival(arrivals),
      scans,
      scanSummary: summarizeScanLog(scans),
    };
  }
}
