import { Shell, PageHeading } from "@/components/shell";
import { listGuests } from "@/lib/db";
import { requireOwner } from "@/lib/guard";
import GuestManager from "./guest-manager";

export const dynamic = "force-dynamic";

export default async function GuestsPage() {
  const settings = await requireOwner();
  const guests = listGuests();

  const seats = guests.reduce((total, guest) => total + guest.seats, 0);

  return (
    <Shell coupleNames={settings.couple_names} current="/guests">
      <PageHeading
        title="Guest list"
        hint={
          guests.length === 0
            ? "Start by adding the people you're inviting."
            : `${guests.length} ${guests.length === 1 ? "invitation" : "invitations"} · ${seats} seats`
        }
      />
      <GuestManager guests={guests} />
    </Shell>
  );
}
