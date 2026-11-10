/** What dwell time needs from a guest's attendance row. */
export type DwellGuest = {
  id: number;
  name: string;
  peakInsideSeats: number;
  insideSeats: number;
  firstInAt: Date | null;
  lastOutAt: Date | null;
};

export type DwellStay = { name: string; minutes: number };

export type EarlyLeaver = {
  guestId: number;
  /** Null when a shared view hides guest names. */
  name: string | null;
  seats: number;
  leftAt: Date;
  stayMinutes: number;
  /** How long before the last scan of the night they left. */
  minutesBeforeEnd: number;
};

export type DwellReport = {
  /** Parties that came at all — the pool the dwell numbers are drawn from. */
  arrivedParties: number;
  /** Parties with a first check-in and a full check-out. Every figure below is based on these only. */
  measuredParties: number;
  averageMinutes: number | null;
  medianMinutes: number | null;
  /** The party's name is null when a shared view hides guest names. */
  shortest: { name: string | null; minutes: number } | null;
  longest: { name: string | null; minutes: number } | null;
  /** The last scan of any kind that night — what "left early" is measured against. */
  lastScanAt: Date | null;
  /** Minutes before the last scan that counts as leaving early. */
  earlyLeaverMinutes: number;
  /** Earliest leaver first. */
  earlyLeavers: EarlyLeaver[];
};

/**
 * A party that left more than an hour before the last scan of the night left
 * early. A fixed hour, not a fraction of the night: a wedding's tail is
 * rarely scheduled, and "an hour before the door went quiet" is something an
 * owner can picture. Callers can override it.
 */
export const EARLY_LEAVER_MINUTES = 60;

const MINUTE = 60_000;

/**
 * Stay length is first check-in to final check-out, so a quick step outside
 * in between is part of the stay. Only parties whose seats are all back out
 * (nobody left inside, someone scanned out) are measured: a party never
 * scanned out has no known stay, and counting it as "stayed until the end"
 * would be a guess.
 *
 * `lastScanAt` is the last scan of any kind that night — the reference point
 * for "left early".
 */
export function analyzeDwell(
  guests: DwellGuest[],
  lastScanAt: Date | null,
  earlyLeaverMinutes: number = EARLY_LEAVER_MINUTES,
): DwellReport {
  let arrivedParties = 0;
  const stays: { guest: DwellGuest; leftAt: Date; minutes: number }[] = [];

  for (const guest of guests) {
    if (!guest.firstInAt) continue;
    arrivedParties += 1;
    if (guest.insideSeats > 0 || !guest.lastOutAt) continue;
    stays.push({
      guest,
      leftAt: guest.lastOutAt,
      minutes: Math.max(guest.lastOutAt.getTime() - guest.firstInAt.getTime(), 0) / MINUTE,
    });
  }

  const byLength = [...stays].sort((a, b) => a.minutes - b.minutes);
  const shortest = byLength[0];
  const longest = byLength[byLength.length - 1];

  const earlyLeavers: EarlyLeaver[] = [];
  if (lastScanAt) {
    for (const stay of stays) {
      const minutesBeforeEnd = (lastScanAt.getTime() - stay.leftAt.getTime()) / MINUTE;
      if (minutesBeforeEnd <= earlyLeaverMinutes) continue;
      earlyLeavers.push({
        guestId: stay.guest.id,
        name: stay.guest.name,
        seats: stay.guest.peakInsideSeats,
        leftAt: stay.leftAt,
        stayMinutes: stay.minutes,
        minutesBeforeEnd,
      });
    }
    earlyLeavers.sort((a, b) => a.leftAt.getTime() - b.leftAt.getTime());
  }

  return {
    arrivedParties,
    measuredParties: stays.length,
    averageMinutes: stays.length ? stays.reduce((sum, stay) => sum + stay.minutes, 0) / stays.length : null,
    medianMinutes: stays.length ? median(byLength.map((stay) => stay.minutes)) : null,
    shortest: shortest ? { name: shortest.guest.name, minutes: shortest.minutes } : null,
    longest: longest ? { name: longest.guest.name, minutes: longest.minutes } : null,
    lastScanAt,
    earlyLeaverMinutes,
    earlyLeavers,
  };
}

function median(sorted: number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
