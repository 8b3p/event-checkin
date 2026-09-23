import Link from "next/link";
import { Shell } from "@/shared/component/Shell";
import type { Event } from "@/features/events/domain/Event";
import { pluralizeAr } from "@/shared/lib/pluralize-ar";
import type { Guest } from "../domain/Guest";
import DeleteGuestButton from "./DeleteGuestButton";
import EditGuestForm from "./EditGuestForm";
import ShareInvite from "./ShareInvite";

export default function GuestDetailPage({
  event,
  guest,
  url,
  qr,
}: {
  event: Event;
  guest: Guest;
  url: string;
  qr: string;
}) {
  return (
    <Shell>
      <Link href={`/events/${event.id}/guests`} className="text-sm text-muted-foreground hover:text-foreground">
        ‹ رجوع إلى الضيوف
      </Link>

      <div className="mb-6 mt-3">
        <h1 className="display text-3xl text-foreground">{guest.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pluralizeAr(guest.seats, { one: "مقعد واحد", two: "مقعدان", few: "مقاعد", many: "مقعد" })}
          {guest.note ? ` · ${guest.note}` : ""}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ShareInvite guest={guest} event={event} url={url} qr={qr} />

        <div className="space-y-5">
          <EditGuestForm eventId={event.id} guest={guest} />

          <div className="rounded-(--radius-card) border border-border bg-card p-5">
            <p className="mb-3 text-sm font-semibold text-foreground">حذف هذه الدعوة</p>
            <p className="mb-3 text-sm text-muted-foreground">هذا سيحذف الدعوة نهائياً.</p>
            <DeleteGuestButton eventId={event.id} guestId={guest.id} />
          </div>
        </div>
      </div>
    </Shell>
  );
}
