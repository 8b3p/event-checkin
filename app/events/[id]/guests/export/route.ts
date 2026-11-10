import { notFound } from "next/navigation";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { ListGuestsForEventUseCase } from "@/features/guests/domain/use-cases/ListGuestsForEventUseCase";
import { makeGuestRepository } from "@/features/guests/infrastructure/factory";
import { csvResponse } from "@/shared/lib/csv";
import { requireOwner } from "@/shared/lib/guard";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;

  const eventId = Number(id);
  if (!Number.isInteger(eventId)) notFound();

  const event = await new GetEventUseCase(makeEventRepository()).execute(eventId);
  if (!event) notFound();

  const guests = await new ListGuestsForEventUseCase(makeGuestRepository()).execute(eventId);

  const header = ["الاسم", "المقاعد", "الهاتف", "ملاحظة", "الرمز", "النوع"];
  const rows = guests.map((guest) => [
    guest.name,
    String(guest.seats),
    guest.phone ?? "",
    guest.note ?? "",
    guest.code,
    guest.source === "invited" ? "مدعو" : "بدون دعوة مسبقة",
  ]);

  return csvResponse([header, ...rows], `guests-${event.id}.csv`, `ضيوف-${event.id}.csv`);
}
