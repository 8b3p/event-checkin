import Link from "next/link";
import { Shell, PageHeading } from "@/shared/component/Shell";
import { EmptyState } from "@/shared/component/empty-state";
import { Badge } from "@/shared/component/ui/badge";
import { Button } from "@/shared/component/ui/button";
import { Card } from "@/shared/component/ui/card";
import type { EventStats } from "@/features/check-in/domain/ScanEvent";
import type { Event } from "../domain/Event";

export type EventWithStats = { event: Event; stats: EventStats };

function formatEventDate(eventDate: string | null): string | null {
  if (!eventDate) return null;
  return new Date(`${eventDate}T00:00:00`).toLocaleDateString("ar-u-nu-latn", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function EventStatusBadge({ status }: { status: Event["status"] }) {
  if (status === "live") {
    return <Badge className="border-transparent bg-good-soft text-good-ink">نشطة</Badge>;
  }
  return <Badge variant="secondary">{status === "draft" ? "مسودة" : "مؤرشفة"}</Badge>;
}

export default function EventListPage({ events }: { events: EventWithStats[] }) {
  const visible = events.filter(({ event }) => event.status !== "archived");

  return (
    <Shell>
      <PageHeading
        title="الفعاليات"
        action={
          <Button asChild>
            <Link href="/events/new">فعالية جديدة</Link>
          </Button>
        }
      />

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            title="لا توجد فعاليات بعد"
            body="أنشئ أول فعالية لك، وستحصل كل دعوة فيها على رمز QR خاص بها."
            action={
              <Button asChild>
                <Link href="/events/new">فعالية جديدة</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map(({ event, stats }) => {
            const when = formatEventDate(event.eventDate);

            return (
              <Link key={event.id} href={`/events/${event.id}`} className="block">
                <Card className="h-full p-5 transition-colors hover:bg-muted">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="display text-lg text-foreground">{event.name}</h2>
                    <EventStatusBadge status={event.status} />
                  </div>
                  {when ? <p className="mt-1 text-sm text-muted-foreground">{when}</p> : null}
                  {event.venue ? <p className="text-sm text-muted-foreground">{event.venue}</p> : null}

                  <p className="mt-4 text-sm text-muted-foreground tabular">
                    {stats.seatsInside} من {stats.seatsInvited} حضروا
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
