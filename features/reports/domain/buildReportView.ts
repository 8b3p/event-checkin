import type { EarlyLeaver } from "./analyzeDwell";
import type { EventReport, ReportGuestRow, ReportView } from "./EventReport";

/**
 * Picks, field by field, what the report sections may see. With
 * `showNames: false` every guest name is dropped — the guest sheet, the
 * early-leaver list and the shortest/longest stays — leaving only counts and
 * times. Phone numbers, guest codes, notes, the door code and the scan log are
 * never part of a view, whoever is looking.
 */
export function buildReportView(report: EventReport, showNames: boolean): ReportView {
  const { event, summary, arrivals, peak, occupancy, dwell } = report;

  const guests: ReportGuestRow[] | null = showNames
    ? report.guests.map((guest) => ({
        id: guest.id,
        name: guest.name,
        seats: guest.seats,
        source: guest.source,
        status: guest.status,
        peakInsideSeats: guest.peakInsideSeats,
        firstInAt: guest.firstInAt,
        lastOutAt: guest.lastOutAt,
      }))
    : null;

  const earlyLeavers: EarlyLeaver[] = dwell.earlyLeavers.map((leaver) => ({
    guestId: leaver.guestId,
    name: showNames ? leaver.name : null,
    seats: leaver.seats,
    leftAt: leaver.leftAt,
    stayMinutes: leaver.stayMinutes,
    minutesBeforeEnd: leaver.minutesBeforeEnd,
  }));

  return {
    event: { name: event.name, eventDate: event.eventDate, venue: event.venue, capacity: event.capacity },
    summary,
    arrivals,
    peak,
    occupancy,
    dwell: {
      ...dwell,
      shortest: dwell.shortest && { name: showNames ? dwell.shortest.name : null, minutes: dwell.shortest.minutes },
      longest: dwell.longest && { name: showNames ? dwell.longest.name : null, minutes: dwell.longest.minutes },
      earlyLeavers,
    },
    guests,
  };
}
