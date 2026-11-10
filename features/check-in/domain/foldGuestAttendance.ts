import type { ScanForBalance } from "./foldGuestBalances";

export type ScanForAttendance = ScanForBalance & { at: Date };

export type GuestAttendance = {
  firstInAt: Date | null;
  lastOutAt: Date | null;
  /** The most seats of the party inside at once — how many of them actually came.
   * Not the sum of `in` scans, which would count someone stepping out and back twice. */
  peakInsideSeats: number;
  insideSeats: number;
};

export type AttendanceStatus = "full" | "partial" | "no_show";

/**
 * Replays an event's scans in time order into per-guest attendance. Builds on
 * the same in/out arithmetic as foldGuestBalances, so `insideSeats` here
 * always agrees with the live status shown at the door.
 */
export function foldGuestAttendance(scans: ScanForAttendance[]): Map<number, GuestAttendance> {
  const ordered = [...scans].sort((a, b) => a.at.getTime() - b.at.getTime());
  const attendance = new Map<number, GuestAttendance>();

  for (const scan of ordered) {
    const current = attendance.get(scan.guestId) ?? {
      firstInAt: null,
      lastOutAt: null,
      peakInsideSeats: 0,
      insideSeats: 0,
    };

    if (scan.direction === "in") {
      current.insideSeats += scan.seats;
      current.firstInAt ??= scan.at;
      current.peakInsideSeats = Math.max(current.peakInsideSeats, current.insideSeats);
    } else {
      current.insideSeats -= scan.seats;
      current.lastOutAt = scan.at;
    }

    attendance.set(scan.guestId, current);
  }

  return attendance;
}

export function attendanceStatus(partySeats: number, attendance: GuestAttendance | undefined): AttendanceStatus {
  if (!attendance || attendance.firstInAt === null) return "no_show";
  return attendance.peakInsideSeats >= partySeats ? "full" : "partial";
}
