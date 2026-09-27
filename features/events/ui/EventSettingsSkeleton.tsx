import { Shell } from "@/shared/component/Shell";
import { Card, CardContent, CardHeader } from "@/shared/component/ui/card";
import { Skeleton } from "@/shared/component/ui/skeleton";

export default function EventSettingsSkeleton() {
  return (
    <Shell>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>

      <div className="mb-6 mt-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-2 h-4 w-40" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-28" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}
