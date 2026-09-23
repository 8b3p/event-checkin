import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { GetGuestUseCase } from "@/features/guests/domain/use-cases/GetGuestUseCase";
import { makeGuestRepository } from "@/features/guests/infrastructure/factory";
import { inviteUrl } from "@/shared/lib/codes";
import { requireOwner } from "@/shared/lib/guard";
import GuestDetailPage from "@/features/guests/ui/GuestDetailPage";

export const dynamic = "force-dynamic";

export default async function EventGuestDetailPage({
  params,
}: {
  params: Promise<{ id: string; guestId: string }>;
}) {
  await requireOwner();
  const { id, guestId } = await params;

  const eventId = Number(id);
  const numericGuestId = Number(guestId);
  if (!Number.isInteger(eventId) || !Number.isInteger(numericGuestId)) notFound();

  const event = await new GetEventUseCase(makeEventRepository()).execute(eventId);
  if (!event) notFound();

  const guest = await new GetGuestUseCase(makeGuestRepository()).execute(eventId, numericGuestId);
  if (!guest) notFound();

  const url = inviteUrl(guest.code);
  const qr = await QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 1, width: 720 });

  return <GuestDetailPage event={event} guest={guest} url={url} qr={qr} />;
}
