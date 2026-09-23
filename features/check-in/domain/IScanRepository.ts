import type {
  ArrivalBucket,
  EventStats,
  GuestWithStatus,
  RecentScan,
  RecordScanInput,
  ScanEvent,
} from "./ScanEvent";

export interface IScanRepository {
  record(input: RecordScanInput): Promise<ScanEvent>;
  listForGuest(guestId: number): Promise<ScanEvent[]>;
  undoLast(guestId: number): Promise<boolean>;
  insideSeatsForGuest(guestId: number): Promise<number>;
  listGuestsWithStatus(eventId: number, query?: string): Promise<GuestWithStatus[]>;
  eventStats(eventId: number): Promise<EventStats>;
  arrivalBuckets(eventId: number): Promise<ArrivalBucket[]>;
  recentScans(eventId: number, limit?: number): Promise<RecentScan[]>;
}
