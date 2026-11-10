import Link from "next/link";
import type { Event } from "@/features/events/domain/Event";
import { EmptyState } from "@/shared/component/empty-state";
import { PageHeading, Shell } from "@/shared/component/Shell";
import { Button } from "@/shared/component/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/component/ui/card";
import { pluralizeAr } from "@/shared/lib/pluralize-ar";
import type { EventFeedbackItem } from "../domain/Feedback";
import { MAX_RATING } from "../domain/Feedback";
import type { FeedbackSummary } from "../domain/summarizeFeedback";
import { StarRating } from "./StarRating";

const dateFormat = new Intl.DateTimeFormat("ar-u-nu-latn", { day: "numeric", month: "long", year: "numeric" });

export default function FeedbackPage({
  event,
  items,
  summary,
}: {
  event: Event;
  items: EventFeedbackItem[];
  summary: FeedbackSummary;
}) {
  const ratings = Array.from({ length: MAX_RATING }, (_, i) => MAX_RATING - i) as (1 | 2 | 3 | 4 | 5)[];
  const widest = Math.max(1, ...ratings.map((rating) => summary.distribution[rating]));

  return (
    <Shell>
      <Link href={`/events/${event.id}`} className="text-sm text-muted-foreground hover:text-foreground">
        ‹ رجوع إلى {event.name}
      </Link>

      <div className="mt-3">
        <PageHeading
          title="آراء الضيوف"
          hint={
            summary.count === 0
              ? "لم يصل أي رأي بعد. يظهر نموذج الرأي في صفحة دعوة كل ضيف بعد انتهاء الفعالية."
              : pluralizeAr(summary.count, { one: "رأي واحد", two: "رأيان", few: "آراء", many: "رأياً" })
          }
          action={
            items.length > 0 ? (
              <Button asChild variant="outline" size="sm">
                <a href={`/events/${event.id}/feedback/export`}>تصدير CSV</a>
              </Button>
            ) : undefined
          }
        />
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState title="لا توجد آراء بعد" body="عندما يرسل الضيوف تقييماتهم ستظهر هنا." />
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <Card data-testid="feedback-summary" className="self-start">
            <CardHeader>
              <CardTitle>المتوسط</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="display text-5xl text-foreground">{summary.average?.toLocaleString("ar-u-nu-latn")}</span>
                <div>
                  <StarRating rating={Math.round(summary.average ?? 0)} />
                  <p className="mt-1 text-xs text-muted-foreground">من {MAX_RATING}</p>
                </div>
              </div>

              <ul className="space-y-2">
                {ratings.map((rating) => {
                  const count = summary.distribution[rating];
                  return (
                    <li key={rating} className="flex items-center gap-3 text-sm" data-testid={`distribution-${rating}`}>
                      <span className="w-4 shrink-0 text-center tabular-nums text-muted-foreground">{rating}</span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-ring" style={{ width: `${(count / widest) * 100}%` }} />
                      </div>
                      <span className="w-6 shrink-0 text-end tabular-nums text-muted-foreground">{count}</span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>الآراء</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <li key={item.guestId} data-testid="feedback-item" className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                      <span className="font-medium text-foreground">{item.guestName}</span>
                      <span className="text-xs text-muted-foreground">{dateFormat.format(item.updatedAt)}</span>
                    </div>
                    <div className="mt-1">
                      <StarRating rating={item.rating} className="size-4" />
                    </div>
                    {item.comment ? (
                      <p className="mt-2 whitespace-pre-line text-sm text-foreground">{item.comment}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </Shell>
  );
}
