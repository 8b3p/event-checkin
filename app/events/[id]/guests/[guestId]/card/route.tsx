import { notFound } from "next/navigation";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { GetGuestUseCase } from "@/features/guests/domain/use-cases/GetGuestUseCase";
import { makeGuestRepository } from "@/features/guests/infrastructure/factory";
import { requireOwner } from "@/shared/lib/guard";
import { renderGuestCardImage } from "./render-card";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; guestId: string }> }) {
  await requireOwner();
  const { id, guestId } = await params;

  const eventId = Number(id);
  const numericGuestId = Number(guestId);
  if (!Number.isInteger(eventId) || !Number.isInteger(numericGuestId)) notFound();

  const event = await new GetEventUseCase(makeEventRepository()).execute(eventId);
  if (!event) notFound();

  const guest = await new GetGuestUseCase(makeGuestRepository()).execute(eventId, numericGuestId);
  if (!guest) notFound();

  return renderGuestCardImage(guest);
}
