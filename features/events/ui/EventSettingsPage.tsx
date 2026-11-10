import Link from "next/link";
import { Shell, PageHeading } from "@/shared/component/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/component/ui/card";
import type { Event } from "../domain/Event";
import ArchiveEventButton from "./ArchiveEventButton";
import DuplicateEventButton from "./DuplicateEventButton";
import EventSettingsForm from "./EventSettingsForm";
import RestoreEventButton from "./RestoreEventButton";

export default function EventSettingsPage({ event }: { event: Event }) {
  return (
    <Shell>
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ‹ رجوع إلى الفعاليات
        </Link>
        <Link href={`/events/${event.id}/guests`} className="text-sm font-medium text-primary hover:underline">
          الضيوف ›
        </Link>
      </div>

      <div className="mt-3">
        <PageHeading title={event.name} hint={event.venue ?? undefined} />
      </div>

      {event.status === "archived" ? (
        <div role="status" className="mb-5 rounded-lg border border-border bg-muted p-4 text-sm">
          <p className="font-medium text-foreground">هذه الفعالية مؤرشفة</p>
          <p className="mt-1 text-muted-foreground">
            تم إغلاق الباب: لا يمكن تسجيل الدخول برمز الباب ولا مسح الضيوف. يمكنك استعادة الفعالية لإعادة فتحه.
          </p>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <EventSettingsForm event={event} />

        <Card>
          <CardHeader>
            <CardTitle>إجراءات أخرى</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <DuplicateEventButton eventId={event.id} />
            {event.status === "archived" ? (
              <RestoreEventButton eventId={event.id} />
            ) : (
              <ArchiveEventButton eventId={event.id} />
            )}
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}
