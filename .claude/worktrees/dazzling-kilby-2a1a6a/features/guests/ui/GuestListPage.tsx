import Link from "next/link";
import { Shell, PageHeading } from "@/shared/component/Shell";
import type { Event } from "@/features/events/domain/Event";
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
              : `${guests.length === 1 ? "دعوة واحدة" : `${guests.length} دعوات`} · ${seats === 1 ? "مقعد واحد" : `${seats} مقاعد`}`
          }
        />
      </div>

      <GuestManager eventId={event.id} guests={guests} />
    </Shell>
  );
}
