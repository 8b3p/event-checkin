import Link from "next/link";
import { Shell, PageHeading } from "@/shared/component/Shell";
import type { Event } from "@/features/events/domain/Event";
import { pluralizeAr } from "@/shared/lib/pluralize-ar";
import type { Guest } from "../domain/Guest";
import GuestManager from "./GuestManager";

export default function GuestListPage({ event, guests }: { event: Event; guests: Guest[] }) {
  const seats = guests.reduce((total, guest) => total + guest.seats, 0);

  return (
    <Shell>
      <Link href={`/events/${event.id}`} className="text-sm text-muted-foreground hover:text-foreground">
        ‹ رجوع إلى {event.name}
      </Link>

      <div className="mt-3">
        <PageHeading
          title="الضيوف"
          hint={
            guests.length === 0
              ? "ابدأ بإضافة الأشخاص الذين تدعوهم."
              : `${pluralizeAr(guests.length, { one: "دعوة واحدة", two: "دعوتان", few: "دعوات", many: "دعوة" })} · ${pluralizeAr(seats, { one: "مقعد واحد", two: "مقعدان", few: "مقاعد", many: "مقعد" })}`
          }
        />
      </div>

      <GuestManager eventId={event.id} guests={guests} />
    </Shell>
  );
}
