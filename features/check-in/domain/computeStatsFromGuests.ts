import type { EventStats, GuestWithStatus } from "./ScanEvent";

/**
 * Derives event-wide stats from a guest-with-status list. Shared by
 * `ScanRepository.eventStats()` (server, over a fresh DB read) and the
 * offline-first client (over its locally cached + pending-adjusted guest
 * list, so a commit's effect on the header counters is instant — see
 * docs/superpowers/specs/2026-09-26-offline-first-scan-and-ux-polish.md §6.5).
 */
export function computeStatsFromGuests(guests: GuestWithStatus[]): EventStats {
  return {
    invites: guests.length,
    seatsInvited: guests.reduce((sum, g) => sum + g.seats, 0),
    guestsInside: guests.filter((g) => g.insideSeats > 0).length,
    seatsInside: guests.reduce((sum, g) => sum + Math.max(g.insideSeats, 0), 0),
  };
}
