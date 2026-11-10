import type { ArrivalBucket, EventScan, GuestAttendanceRow } from "@/features/check-in/domain/ScanEvent";
import type { Event } from "@/features/events/domain/Event";
import type { AttendanceSummary } from "./summarizeAttendance";
import type { ScanLogSummary } from "./summarizeScanLog";

export type EventReport = {
  event: Event;
  summary: AttendanceSummary;
  guests: GuestAttendanceRow[];
  /** Check-ins per 15 minutes, quiet blocks filled in. */
  arrivals: ArrivalBucket[];
  peak: ArrivalBucket | null;
  /** The full scan log, oldest first. */
  scans: EventScan[];
  scanSummary: ScanLogSummary;
};
