export type ScanDirection = "in" | "out";
export type ScanMethod = "qr" | "manual";

export type ScanEvent = {
  id: number;
  guestId: number;
  direction: ScanDirection;
  method: ScanMethod;
  seats: number;
  at: Date;
  scannedBy: string;
  override: boolean;
  /** Idempotency key for a scan queued while offline; null for one recorded live. */
  clientScanId: string | null;
};

export type RecordScanInput = {
  guestId: number;
  direction: ScanDirection;
  method: ScanMethod;
  seats: number;
  scannedBy: string;
  override: boolean;
  clientScanId?: string | null;
};

export type GuestWithStatus = {
  id: number;
  name: string;
  seats: number;
  phone: string | null;
  note: string | null;
  code: string;
  source: "invited" | "walk_in";
  insideSeats: number;
};

export type EventStats = {
  invites: number;
  seatsInvited: number;
  guestsInside: number;
  seatsInside: number;
};

export type ArrivalBucket = { minute: string; seats: number };

export type RecentScan = {
  guestName: string;
  direction: ScanDirection;
  method: ScanMethod;
  seats: number;
  at: Date;
  scannedBy: string;
  override: boolean;
};
