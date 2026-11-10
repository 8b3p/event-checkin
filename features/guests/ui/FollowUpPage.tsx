import Link from "next/link";
import { Shell, PageHeading } from "@/shared/component/Shell";
import type { GuestAttendanceRow } from "@/features/check-in/domain/ScanEvent";
import type { Event } from "@/features/events/domain/Event";
import type { FollowUpGuest } from "../domain/followUps";
import FollowUpList from "./FollowUpList";
import GuestsSubnav from "./GuestsSubnav";

export default function FollowUpPage({ event, attendance }: { event: Event; attendance: GuestAttendanceRow[] }) {
  // Only what the list needs crosses to the client.
  const guests: FollowUpGuest[] = attendance.map((row) => ({
    id: row.id,
    name: row.name,
    seats: row.seats,
    phone: row.phone,
    source: row.source,
    status: row.status,
    peakInsideSeats: row.peakInsideSeats,
  }));

  return (
    <Shell>
      <Link href={`/events/${event.id}`} className="text-sm text-muted-foreground hover:text-foreground">
        ‹ رجوع إلى {event.name}
      </Link>

      <div className="mt-3">
        <PageHeading title="الضيوف" hint="رسائل شكر لمن حضر، وتواصل مع من لم يحضر." />
      </div>

      <GuestsSubnav eventId={event.id} current="follow-up" />
      <FollowUpList guests={guests} />
    </Shell>
  );
}
