import type { ArrivalBucket, EventScan, GuestAttendanceRow } from "@/features/check-in/domain/ScanEvent";
import type { Event } from "@/features/events/domain/Event";
import type { DwellReport } from "./analyzeDwell";
import type { OccupancyReplay } from "./replayOccupancy";
import type { AttendanceSummary } from "./summarizeAttendance";
import type { ScanLogSummary } from "./summarizeScanLog";

export type EventReport = {
  event: Event;
  summary: AttendanceSummary;
  guests: GuestAttendanceRow[];
  /** Check-ins per 15 minutes, quiet blocks filled in. */
  arrivals: ArrivalBucket[];
  peak: ArrivalBucket | null;
  /** Headcount over time, replayed from the scan log. */
  occupancy: OccupancyReplay;
  /** How long parties stayed, and who left early. */
  dwell: DwellReport;
  /** The full scan log, oldest first. */
  scans: EventScan[];
  scanSummary: ScanLogSummary;
};

/** One line of the guest sheet: no phone, code or note. */
export type ReportGuestRow = Pick<
  GuestAttendanceRow,
  "id" | "name" | "seats" | "source" | "status" | "peakInsideSeats" | "firstInAt" | "lastOutAt"
>;

/**
 * What the report sections render. A whitelist, deliberately narrower than
 * EventReport: it is the only thing a shared (logged-out) page ever receives,
 * so a field added to EventReport later is not exposed until it is added here.
 */
export type ReportView = Pick<EventReport, "summary" | "arrivals" | "peak" | "occupancy" | "dwell"> & {
  event: Pick<Event, "name" | "eventDate" | "venue" | "capacity">;
  /** Null when guest names are hidden — there is no useful anonymous guest sheet. */
  guests: ReportGuestRow[] | null;
};
