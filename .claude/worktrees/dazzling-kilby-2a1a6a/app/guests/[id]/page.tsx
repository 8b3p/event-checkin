import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Shell } from "@/components/shell";
import { Badge, Button, Card, CardHeader } from "@/components/ui";
import { inviteUrl } from "@/lib/codes";
import { getGuestById, listCheckinsForGuest } from "@/lib/db";
import { requireOwner } from "@/lib/guard";
import { deleteGuestAction, undoCheckinAction } from "../actions";
import DeleteGuest from "./delete-guest";
import EditGuest from "./edit-guest";
import ShareInvite from "./share-invite";

export const dynamic = "force-dynamic";

export default async function GuestPage({ params }: { params: Promise<{ id: string }> }) {
  const settings = await requireOwner();
  const { id } = await params;

  const guest = getGuestById(Number(id));
  if (!guest) notFound();

  const url = inviteUrl(guest.code);
  const qr = await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 1, width: 720 });
  const checkins = listCheckinsForGuest(guest.id);

  return (
    <Shell coupleNames={settings.couple_names} current="/guests">
      <Link href="/guests" className="text-sm text-muted hover:text-ink">
        ‹ Back to guest list
      </Link>

      <div className="mb-6 mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-3xl text-ink">{guest.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {guest.seats === 1 ? "1 seat" : `${guest.seats} seats`}
            {guest.note ? ` · ${guest.note}` : ""}
          </p>
        </div>
        {guest.arrived === 0 ? (
          <Badge tone="neutral">Not here yet</Badge>
        ) : guest.arrived >= guest.seats ? (
          <Badge tone="good">All {guest.arrived} arrived</Badge>
        ) : (
          <Badge tone="warn">
            {guest.arrived} of {guest.seats} arrived
          </Badge>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ShareInvite
          guest={{ name: guest.name, seats: guest.seats, phone: guest.phone, code: guest.code }}
          coupleNames={settings.couple_names}
          eventDate={settings.event_date}
          venue={settings.venue}
          url={url}
          qr={qr}
        />

        <div className="space-y-5">
          <EditGuest guest={guest} />

          <Card>
            <CardHeader title="Arrivals" hint="Every scan at the door, newest last." />
            {checkins.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">Nothing yet — they haven't arrived.</p>
            ) : (
              <ul className="divide-y divide-line">
                {checkins.map((checkin) => (
                  <li key={checkin.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <span className="text-ink tabular">
                      {new Date(checkin.at).toLocaleString(undefined, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="text-muted">
                      {checkin.seats === 1 ? "1 person" : `${checkin.seats} people`} · {checkin.scanned_by}
                    </span>
                    {checkin.override ? <Badge tone="warn">Let in again</Badge> : null}
                  </li>
                ))}
              </ul>
            )}

            {checkins.length > 0 ? (
              <form action={undoCheckinAction} className="border-t border-line px-5 py-4">
                <input type="hidden" name="id" value={guest.id} />
                <Button type="submit">Undo the last arrival</Button>
              </form>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Remove this invitation" hint="This also deletes their arrival history." />
            <div className="px-5 py-4">
              <DeleteGuest id={guest.id} name={guest.name} action={deleteGuestAction} />
            </div>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
