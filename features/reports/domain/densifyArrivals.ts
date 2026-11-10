import type { ArrivalBucket } from "@/features/check-in/domain/ScanEvent";

export const BUCKET_MINUTES = 15;
const MAX_BUCKETS = 48; // 12 hours; a wedding does not outrun this.

/**
 * Fills the quiet 15-minute blocks between the first and last arrival so a
 * lull reads as a lull, not as missing time. Bucket keys are full UTC ISO
 * strings, exactly as ScanRepository.arrivalBuckets() produces them.
 */
export function densifyArrivals(buckets: ArrivalBucket[]): ArrivalBucket[] {
  if (buckets.length === 0) return [];

  const sorted = [...buckets].sort((a, b) => a.minute.localeCompare(b.minute));
  const first = new Date(sorted[0].minute).getTime();
  const last = new Date(sorted[sorted.length - 1].minute).getTime();
  const step = BUCKET_MINUTES * 60 * 1000;
  const seatsAt = new Map(sorted.map((bucket) => [new Date(bucket.minute).getTime(), bucket.seats]));

  const filled: ArrivalBucket[] = [];
  for (let time = first; time <= last && filled.length < MAX_BUCKETS; time += step) {
    filled.push({ minute: new Date(time).toISOString(), seats: seatsAt.get(time) ?? 0 });
  }
  return filled;
}

/** The busiest block — the first one, if several tie. */
export function peakArrival(buckets: ArrivalBucket[]): ArrivalBucket | null {
  let peak: ArrivalBucket | null = null;
  for (const bucket of buckets) {
    if (!peak || bucket.seats > peak.seats) peak = bucket;
  }
  return peak && peak.seats > 0 ? peak : null;
}
