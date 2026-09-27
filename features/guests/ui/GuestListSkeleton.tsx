import { Shell, PageHeading } from "@/shared/component/Shell";
import { Card } from "@/shared/component/ui/card";
import { Skeleton } from "@/shared/component/ui/skeleton";

export default function GuestListSkeleton() {
  return (
    <Shell>
      <Skeleton className="h-4 w-40" />

      <div className="mt-3">
        <PageHeading title="الضيوف" hint=" " />
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-24" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
          <Skeleton className="h-9 w-full max-w-xs" />
          <Skeleton className="h-9 w-20" />
          <Skeleton className="ms-auto h-4 w-32" />
        </div>
        <ul className="divide-y divide-border">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="flex items-center gap-4 px-5 py-3.5">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </Shell>
  );
}
