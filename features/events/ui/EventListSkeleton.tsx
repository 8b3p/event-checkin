import { Shell, PageHeading } from "@/shared/component/Shell";
import { Card } from "@/shared/component/ui/card";
import { Skeleton } from "@/shared/component/ui/skeleton";

export default function EventListSkeleton() {
  return (
    <Shell>
      <PageHeading title="الفعاليات" action={<Skeleton className="h-9 w-28" />} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Card key={i} className="h-full p-5">
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <Skeleton className="mt-3 h-4 w-1/2" />
            <Skeleton className="mt-2 h-4 w-1/3" />
            <Skeleton className="mt-5 h-4 w-2/5" />
          </Card>
        ))}
      </div>
    </Shell>
  );
}
