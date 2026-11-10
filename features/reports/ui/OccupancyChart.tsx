"use client";

import { useId, useState, type PointerEvent } from "react";
import { pluralizeAr } from "@/shared/lib/pluralize-ar";
import type { OccupancyPoint } from "../domain/replayOccupancy";
import { niceCeiling } from "./chartScale";

const TIME = new Intl.DateTimeFormat("ar-u-nu-latn", { hour: "2-digit", minute: "2-digit" });
const HEIGHT = 156;
const MINIMUM_SPAN = 15 * 60 * 1000;

const people = (n: number) => pluralizeAr(n, { one: "شخص واحد", two: "شخصان", few: "أشخاص", many: "شخصاً" });

/** The headcount in force at `time`: the last point at or before it. */
function insideAt(points: OccupancyPoint[], time: number): OccupancyPoint {
  let current = points[0];
  for (const point of points) {
    if (point.at.getTime() > time) break;
    current = point;
  }
  return current;
}

/**
 * People inside over time, as a step area (a headcount holds until the next
 * scan) — the same visual language as ArrivalsChart. Whatever sits above the
 * capacity line is tinted, so an overrun reads at a glance.
 */
export default function OccupancyChart({ points, capacity }: { points: OccupancyPoint[]; capacity: number | null }) {
  const clipId = useId();
  const [hoverFraction, setHoverFraction] = useState<number | null>(null);

  if (points.length === 0) {
    return <p className="px-5 py-10 text-center text-sm text-muted-foreground">لم يُسجَّل أي مسح لهذه الفعالية.</p>;
  }

  const start = points[0].at.getTime();
  const end = Math.max(points[points.length - 1].at.getTime(), start + MINIMUM_SPAN);
  const span = end - start;
  const highest = Math.max(...points.map((point) => point.inside), capacity ?? 0);
  const ceiling = Math.max(niceCeiling(highest), 2);
  const ticks = [ceiling, Math.round(ceiling / 2), 0];

  const x = (time: number) => ((time - start) / span) * 100;
  const y = (inside: number) => (1 - inside / ceiling) * 100;

  // Percent coordinates in a 0–100 box, stretched to fit: a step is a horizontal run then a vertical jump.
  let outline = `M ${x(points[0].at.getTime())} ${y(points[0].inside)}`;
  for (let index = 1; index < points.length; index++) {
    outline += ` H ${x(points[index].at.getTime())} V ${y(points[index].inside)}`;
  }
  outline += ` H 100`;
  const area = `${outline} V 100 H 0 Z`;

  const hovered = hoverFraction === null ? null : insideAt(points, start + hoverFraction * span);
  const capacityY = capacity === null ? null : y(capacity);

  function track(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0) return;
    setHoverFraction(Math.min(Math.max((event.clientX - box.left) / box.width, 0), 1));
  }

  return (
    <div className="px-5 pb-5 pt-2">
      {/* Time runs left to right here even in the RTL page, like a clock-face timeline. */}
      <div dir="ltr" className="flex gap-3">
        <div className="relative w-8 shrink-0" style={{ height: HEIGHT }}>
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2 text-xs text-muted-foreground tabular"
              style={{ top: `${y(tick)}%` }}
            >
              {tick}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div
            className="relative touch-pan-y"
            style={{ height: HEIGHT }}
            role="img"
            aria-label="عدد الموجودين داخل القاعة على مدار الليلة"
            onPointerMove={track}
            onPointerLeave={() => setHoverFraction(null)}
          >
            {ticks.map((tick) => (
              <div key={tick} className="absolute inset-x-0 border-t border-line" style={{ top: `${y(tick)}%` }} />
            ))}

            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
              <defs>
                {capacityY !== null ? (
                  <clipPath id={clipId}>
                    <rect x="0" y="0" width="100" height={Math.max(capacityY, 0)} />
                  </clipPath>
                ) : null}
              </defs>
              <path d={area} className="fill-ring/25 print:fill-ring/40" />
              {capacityY !== null ? (
                <path d={area} clipPath={`url(#${clipId})`} className="fill-bad/45" />
              ) : null}
              <path
                d={outline}
                fill="none"
                className="stroke-ring"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
              {capacityY !== null ? (
                <line
                  x1="0"
                  x2="100"
                  y1={capacityY}
                  y2={capacityY}
                  className="stroke-bad"
                  strokeWidth="1.5"
                  strokeDasharray="5 4"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
            </svg>

            {hoverFraction !== null ? (
              <div
                className="pointer-events-none absolute inset-y-0 border-s border-ink/40"
                style={{ left: `${hoverFraction * 100}%` }}
              />
            ) : null}
          </div>

          <div className="mt-1.5 flex justify-between text-xs text-muted-foreground tabular" suppressHydrationWarning>
            <span suppressHydrationWarning>{TIME.format(new Date(start))}</span>
            <span suppressHydrationWarning>{TIME.format(new Date(end))}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        {capacity !== null ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0 w-5 border-t-2 border-dashed border-bad" />
            السعة {capacity}
          </span>
        ) : null}
        <span className="print:hidden" aria-live="polite">
          {hovered
            ? `${TIME.format(hovered.at)} — ${people(hovered.inside)} داخل القاعة`
            : "مرّر على الرسم لترى عدد الموجودين في أي وقت."}
        </span>
      </div>
    </div>
  );
}
