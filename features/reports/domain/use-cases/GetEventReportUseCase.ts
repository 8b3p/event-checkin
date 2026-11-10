import type { IScanRepository } from "@/features/check-in/domain/IScanRepository";
import type { IEventRepository } from "@/features/events/domain/IEventRepository";
import { analyzeDwell } from "../analyzeDwell";
import { densifyArrivals, peakArrival } from "../densifyArrivals";
import type { EventReport } from "../EventReport";
import { replayOccupancy } from "../replayOccupancy";
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
      occupancy: replayOccupancy(scans, event.capacity),
      dwell: analyzeDwell(guests, lastScanAt(scans)),
      scans,
      scanSummary: summarizeScanLog(scans),
    };
  }
}

/** The most recent scan of any kind — scans arrive oldest first, but don't lean on it. */
function lastScanAt(scans: { at: Date }[]): Date | null {
  return scans.reduce<Date | null>((latest, scan) => (!latest || scan.at > latest ? scan.at : latest), null);
}
