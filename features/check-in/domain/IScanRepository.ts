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
  /** Looks up a scan by its client-generated idempotency key — used by the
   * offline sync endpoint to dedupe a retried/replayed delivery instead of
   * inserting a second row. See spec §6.7-§6.8. */
  findByClientScanId(clientScanId: string): Promise<ScanEvent | null>;
  listForGuest(guestId: number): Promise<ScanEvent[]>;
  undoLast(guestId: number): Promise<boolean>;
  insideSeatsForGuest(guestId: number): Promise<number>;
  listGuestsWithStatus(eventId: number, query?: string): Promise<GuestWithStatus[]>;
  eventStats(eventId: number): Promise<EventStats>;
  arrivalBuckets(eventId: number): Promise<ArrivalBucket[]>;
  recentScans(eventId: number, limit?: number): Promise<RecentScan[]>;
}
