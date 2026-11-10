"use client";

import { useState } from "react";
import type { ArrivalBucket } from "@/features/check-in/domain/ScanEvent";
import { pluralizeAr } from "@/shared/lib/pluralize-ar";
import { niceCeiling } from "./chartScale";

const TIME = new Intl.DateTimeFormat("ar-u-nu-latn", { hour: "2-digit", minute: "2-digit" });

function formatTime(iso: string): string {
  return TIME.format(new Date(iso));
}

function people(n: number): string {
  return pluralizeAr(n, { one: "شخص واحد", two: "شخصان", few: "أشخاص", many: "شخصاً" });
}

/** Expects already-densified buckets (see densifyArrivals). */
export default function ArrivalsChart({ buckets }: { buckets: ArrivalBucket[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (buckets.length === 0) {
    return (
      <p className="px-5 py-10 text-center text-sm text-muted-foreground">لم يُسجَّل أي دخول لهذه الفعالية.</p>
    );
  }

  const peak = Math.max(...buckets.map((bucket) => bucket.seats));
  const peakIndex = buckets.findIndex((bucket) => bucket.seats === peak);
  const ceiling = Math.max(niceCeiling(peak), 2);
  const ticks = [ceiling, Math.round(ceiling / 2), 0];

  const active = hovered === null ? null : buckets[hovered];

  return (
    <div className="px-5 pb-5 pt-2">
      {/* Time runs left to right here even in the RTL page, like a clock-face timeline. */}
      <div dir="ltr" className="flex gap-3">
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
              {buckets.map((bucket, index) => (
                <button
                  key={bucket.minute}
                  type="button"
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(index)}
                  onBlur={() => setHovered(null)}
                  aria-label={`${formatTime(bucket.minute)}: ${people(bucket.seats)}`}
                  className="group relative flex h-full flex-1 items-end justify-center"
                >
                  <span
                    className={`w-full max-w-6 rounded-t-[4px] transition-colors print:bg-ring ${
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

          <div className="mt-1.5 flex justify-between text-xs text-muted-foreground tabular" suppressHydrationWarning>
            <span suppressHydrationWarning>{formatTime(buckets[0].minute)}</span>
            {buckets.length > 1 ? (
              <span suppressHydrationWarning>{formatTime(buckets[buckets.length - 1].minute)}</span>
            ) : null}
          </div>
        </div>
      </div>

      <p className="mt-3 h-5 text-center text-xs text-muted-foreground print:hidden" aria-live="polite">
        {active
          ? `${formatTime(active.minute)} — ${people(active.seats)}`
          : "مرّر على أي عمود لترى عدد من دخلوا خلال تلك الربع ساعة."}
      </p>
    </div>
  );
}
