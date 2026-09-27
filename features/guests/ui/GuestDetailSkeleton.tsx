import { Shell } from "@/shared/component/Shell";
import { Card, CardContent } from "@/shared/component/ui/card";
import { Skeleton } from "@/shared/component/ui/skeleton";

export default function GuestDetailSkeleton() {
  return (
    <Shell>
      <Skeleton className="h-4 w-28" />

      <div className="mb-6 mt-3 space-y-1.5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="flex flex-col items-center border-y border-border bg-muted px-5 py-8">
            <Skeleton className="h-56 w-56" />
          </div>
          <CardContent className="space-y-3 pt-5">
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-9 w-32" />
            </CardContent>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
