import JSZip from "jszip";
import { notFound } from "next/navigation";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { ListGuestsForEventUseCase } from "@/features/guests/domain/use-cases/ListGuestsForEventUseCase";
import { makeGuestRepository } from "@/features/guests/infrastructure/factory";
import { requireOwner } from "@/shared/lib/guard";
import { renderGuestCardImage } from "../[guestId]/card/render-card";

export const maxDuration = 300;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;

  const eventId = Number(id);
  if (!Number.isInteger(eventId)) notFound();

  const event = await new GetEventUseCase(makeEventRepository()).execute(eventId);
  if (!event) notFound();

  const guests = await new ListGuestsForEventUseCase(makeGuestRepository()).execute(eventId);
  if (guests.length === 0) notFound();

  const zip = new JSZip();
  for (const guest of guests) {
    const image = await renderGuestCardImage(event, guest);
    const buffer = await image.arrayBuffer();
    zip.file(`${guest.name}-${guest.code}.png`, buffer);
  }

  const archive = await zip.generateAsync({ type: "uint8array" });

  // HTTP header values must be Latin-1/ByteString — the Arabic filename can't go in
  // `filename=` directly (Response throws "Cannot convert argument to a ByteString" at
  // request time). RFC 5987's `filename*=UTF-8''<percent-encoded>` carries the real
  // Arabic name; the ASCII `filename=` fallback covers any client that ignores `filename*`.
  const filename = `بطاقات-${event.id}.zip`;

  return new Response(archive, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="cards-${event.id}.zip"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
