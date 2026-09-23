"use client";

import { useMemo, useState } from "react";
import type { ArrivalBucket } from "@/features/check-in/domain/ScanEvent";

const BUCKET_MINUTES = 15;
const MAX_BUCKETS = 48; // 12 hours; a wedding does not outrun this.

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Fills the quiet 15-minute blocks so a lull reads as a lull, not as missing time. */
function densify(buckets: ArrivalBucket[]): ArrivalBucket[] {
  if (buckets.length === 0) return [];

  const first = new Date(`${buckets[0].minute}:00`).getTime();
  const last = new Date(`${buckets[buckets.length - 1].minute}:00`).getTime();
  const step = BUCKET_MINUTES * 60 * 1000;
  const seatsAt = new Map(buckets.map((bucket) => [bucket.minute, bucket.seats]));

  const filled: ArrivalBucket[] = [];
  for (let time = first; time <= last && filled.length < MAX_BUCKETS; time += step) {
    const minute = new Date(time).toISOString().slice(0, 16);
    filled.push({ minute, seats: seatsAt.get(minute) ?? 0 });
  }
  return filled;
}

export default function ArrivalsChart({ buckets }: { buckets: ArrivalBucket[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const data = useMemo(() => densify(buckets), [buckets]);

  if (data.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-sm text-muted-foreground">
        Nothing to plot yet. This fills in as guests arrive.
      </p>
    );
  }

  const peak = Math.max(...data.map((bucket) => bucket.seats));
  const peakIndex = data.findIndex((bucket) => bucket.seats === peak);
  const ceiling = Math.max(niceCeiling(peak), 2);
  const ticks = [ceiling, Math.round(ceiling / 2), 0];

  const active = hovered === null ? null : data[hovered];

  return (
    <div className="px-5 pb-5 pt-2">
      <div className="flex gap-3">
        <div className="relative h-[156px] w-8 shrink-0">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2 text-xs text-muted-foreground tabular"
              style={{ top: `${(1 - tick / ceiling) * 100}%` }}
            >
              {tick}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative h-[156px]">
            {/* Recessive hairline grid, drawn behind the marks. */}
            {ticks.map((tick) => (
              <div
                key={tick}
                className="absolute inset-x-0 border-t border-line"
                style={{ top: `${(1 - tick / ceiling) * 100}%` }}
              />
            ))}

            <div className="relative flex h-full items-end gap-[2px]">
              {data.map((bucket, index) => (
                <button
                  key={bucket.minute}
                  type="button"
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(index)}
                  onBlur={() => setHovered(null)}
                  aria-label={`${formatTime(`${bucket.minute}:00`)}: ${bucket.seats} arrived`}
                  className="group relative flex h-full flex-1 items-end justify-center"
                >
                  <span
                    className={`w-full max-w-6 rounded-t-[4px] transition-colors ${
                      hovered === index ? "bg-primary" : "bg-ring"
                    }`}
                    style={{
                      height: `${Math.max((bucket.seats / ceiling) * 100, bucket.seats > 0 ? 2 : 0)}%`,
                    }}
                  />
                  {index === peakIndex && peak > 0 ? (
                    <span
                      className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-xs font-medium text-ink tabular"
                      style={{ bottom: `calc(${(peak / ceiling) * 100}% + 4px)` }}
                    >
                      {peak}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-1.5 flex justify-between text-xs text-muted-foreground tabular">
            <span>{formatTime(`${data[0].minute}:00`)}</span>
            {data.length > 1 ? <span>{formatTime(`${data[data.length - 1].minute}:00`)}</span> : null}
          </div>
        </div>
      </div>

      <p className="mt-3 h-5 text-center text-xs text-muted-foreground" aria-live="polite">
        {active
          ? `${formatTime(`${active.minute}:00`)} — ${active.seats} ${active.seats === 1 ? "person" : "people"}`
          : "Hover a block to see its count."}
      </p>
    </div>
  );
}

/** Rounds the axis top up to something a reader can divide in their head. */
function niceCeiling(value: number): number {
  if (value <= 5) return 5;
  if (value <= 10) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / (magnitude / 2)) * (magnitude / 2);
}
