import type { GuestAttendanceRow } from "@/features/check-in/domain/ScanEvent";

export type AttendanceSummary = {
  invitedGuests: number;
  invitedSeats: number;
  /** Invitations at least one person from turned up for. */
  arrivedGuests: number;
  /** Invited seats actually filled — capped at each invitation's size, so overrides don't inflate turnout. */
  arrivedSeats: number;
  /** arrivedSeats / invitedSeats, or null with no invitations. */
  turnout: number | null;
  fullGuests: number;
  partialGuests: number;
  /** Seats left empty by parties that came short. */
  missingSeats: number;
  noShowGuests: number;
  noShowSeats: number;
  /** People admitted beyond their invitation's size (door overrides). */
  extraSeats: number;
  walkInGuests: number;
  walkInSeats: number;
  /** Everyone who came through the door: arrived invited seats + extras + walk-ins. */
  peopleThroughDoor: number;
  /** Parties never scanned out — the check-out data is incomplete for these. */
  stillInsideGuests: number;
  firstArrivalAt: Date | null;
  /** When the last party to arrive first came in. */
  lastArrivalAt: Date | null;
};

export function summarizeAttendance(rows: GuestAttendanceRow[]): AttendanceSummary {
  const summary: AttendanceSummary = {
    invitedGuests: 0,
    invitedSeats: 0,
    arrivedGuests: 0,
    arrivedSeats: 0,
    turnout: null,
    fullGuests: 0,
    partialGuests: 0,
    missingSeats: 0,
    noShowGuests: 0,
    noShowSeats: 0,
    extraSeats: 0,
    walkInGuests: 0,
    walkInSeats: 0,
    peopleThroughDoor: 0,
    stillInsideGuests: 0,
    firstArrivalAt: null,
    lastArrivalAt: null,
  };

  for (const row of rows) {
    if (row.insideSeats > 0) summary.stillInsideGuests += 1;

    if (row.firstInAt) {
      if (!summary.firstArrivalAt || row.firstInAt < summary.firstArrivalAt) summary.firstArrivalAt = row.firstInAt;
      if (!summary.lastArrivalAt || row.firstInAt > summary.lastArrivalAt) summary.lastArrivalAt = row.firstInAt;
    }

    if (row.source === "walk_in") {
      if (row.status !== "no_show") summary.walkInGuests += 1;
      summary.walkInSeats += row.peakInsideSeats;
      continue;
    }

    summary.invitedGuests += 1;
    summary.invitedSeats += row.seats;

    if (row.status === "no_show") {
      summary.noShowGuests += 1;
      summary.noShowSeats += row.seats;
      continue;
    }

    summary.arrivedGuests += 1;
    summary.arrivedSeats += Math.min(row.peakInsideSeats, row.seats);
    summary.extraSeats += Math.max(row.peakInsideSeats - row.seats, 0);

    if (row.status === "full") {
      summary.fullGuests += 1;
    } else {
      summary.partialGuests += 1;
      summary.missingSeats += row.seats - row.peakInsideSeats;
    }
  }

  summary.turnout = summary.invitedSeats > 0 ? summary.arrivedSeats / summary.invitedSeats : null;
  summary.peopleThroughDoor = summary.arrivedSeats + summary.extraSeats + summary.walkInSeats;
  return summary;
}
