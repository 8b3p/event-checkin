export type OccupancyScan = { direction: "in" | "out"; seats: number; at: Date };

/** Headcount right after the scans at `at` were applied; it holds until the next point. */
export type OccupancyPoint = { at: Date; inside: number };

export type OverCapacity = {
  /** The first time headcount went above capacity. */
  firstAt: Date;
  /** Total minutes spent above capacity, across every stretch. */
  minutes: number;
  /** The most people over capacity at any one moment. */
  peakExcess: number;
  /** Still above capacity at the last scan — the real overrun is unknown past it. */
  stillOverAtEnd: boolean;
};

export type OccupancyReplay = {
  /** A step function: each point's headcount holds until the next point. Oldest first. */
  points: OccupancyPoint[];
  /** The highest headcount, and the first time it was reached. */
  peak: { inside: number; at: Date } | null;
  capacity: number | null;
  /** Null when no capacity is set or headcount never went above it. */
  overCapacity: OverCapacity | null;
  /** Headcount after the last scan. Parties never scanned out stay in it, so every figure here is an upper bound. */
  stillInside: number;
};

const MINUTE = 60_000;

/**
 * Replays an event's scans (in adds seats, out removes them) into headcount
 * over time. Scans at the same instant collapse into one point with arrivals
 * applied first, so a simultaneous in/out never dips below the true number.
 * Headcount is clamped at zero: a stray out-scan is a data glitch, not
 * negative people.
 *
 * Nobody scanned out is assumed to still be inside, so the peak and any
 * over-capacity time are upper bounds when check-outs are incomplete.
 */
export function replayOccupancy(scans: OccupancyScan[], capacity: number | null): OccupancyReplay {
  const ordered = [...scans].sort(
    (a, b) => a.at.getTime() - b.at.getTime() || Number(b.direction === "in") - Number(a.direction === "in"),
  );

  const points: OccupancyPoint[] = [];
  let inside = 0;
  for (const scan of ordered) {
    inside = Math.max(inside + (scan.direction === "in" ? scan.seats : -scan.seats), 0);
    const last = points[points.length - 1];
    if (last && last.at.getTime() === scan.at.getTime()) {
      last.inside = inside;
    } else {
      points.push({ at: scan.at, inside });
    }
  }

  let peak: OccupancyReplay["peak"] = null;
  for (const point of points) {
    if (!peak || point.inside > peak.inside) peak = { inside: point.inside, at: point.at };
  }

  return {
    points,
    peak,
    capacity,
    overCapacity: capacity === null ? null : measureOverCapacity(points, capacity),
    stillInside: inside,
  };
}

function measureOverCapacity(points: OccupancyPoint[], capacity: number): OverCapacity | null {
  let firstAt: Date | null = null;
  let milliseconds = 0;
  let peakExcess = 0;

  points.forEach((point, index) => {
    if (point.inside <= capacity) return;
    firstAt ??= point.at;
    peakExcess = Math.max(peakExcess, point.inside - capacity);
    const next = points[index + 1];
    if (next) milliseconds += next.at.getTime() - point.at.getTime();
  });

  if (!firstAt) return null;
  return {
    firstAt,
    minutes: milliseconds / MINUTE,
    peakExcess,
    stillOverAtEnd: points[points.length - 1].inside > capacity,
  };
}
