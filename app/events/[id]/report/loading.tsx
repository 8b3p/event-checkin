import { Shell } from "@/shared/component/Shell";
import { Card } from "@/shared/component/ui/card";
import { Skeleton } from "@/shared/component/ui/skeleton";

export default function Loading() {
  return (
    <Shell>
      <Skeleton className="h-4 w-32" />
      <div className="mb-6 mt-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-40" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-2 h-8 w-16" />
          </Card>
        ))}
      </div>
      <Card className="mt-6 p-5">
        <Skeleton className="h-[180px] w-full" />
      </Card>
    </Shell>
  );
}
