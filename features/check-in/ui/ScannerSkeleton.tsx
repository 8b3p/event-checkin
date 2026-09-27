import { Skeleton } from "@/shared/component/ui/skeleton";

/** Dark, full-bleed placeholder matching the scanner's night theme, so the
 * transition from a light dashboard page into `/scan` isn't a jarring
 * light→dark flash while the event/guest data loads. */
export default function ScannerSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col bg-night text-night-ink" dir="rtl">
      <header className="flex items-center gap-4 border-b border-night-line px-5 py-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-5 w-32 bg-night-raised" />
          <Skeleton className="h-3 w-20 bg-night-raised" />
        </div>
        <div className="text-left space-y-1.5">
          <Skeleton className="h-5 w-16 bg-night-raised" />
          <Skeleton className="h-3 w-20 bg-night-raised" />
        </div>
      </header>

      <div className="flex gap-2 border-b border-night-line px-5 py-2">
        <Skeleton className="h-7 w-20 rounded-full bg-night-raised" />
        <Skeleton className="h-7 w-24 rounded-full bg-night-raised" />
      </div>

      <div className="flex-1" />

      <div className="border-t border-night-line px-5 py-4">
        <Skeleton className="h-12 w-full rounded-xl bg-night-raised" />
      </div>
    </div>
  );
}
