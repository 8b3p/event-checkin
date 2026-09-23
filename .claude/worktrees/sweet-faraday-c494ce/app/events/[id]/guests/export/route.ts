import { notFound } from "next/navigation";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { ListGuestsForEventUseCase } from "@/features/guests/domain/use-cases/ListGuestsForEventUseCase";
import { makeGuestRepository } from "@/features/guests/infrastructure/factory";
import { requireOwner } from "@/shared/lib/guard";

const DANGEROUS_PREFIX = /^[=+\-@\t\r]/;

function csvField(value: string): string {
  const safe = DANGEROUS_PREFIX.test(value) ? `'${value}` : value;
  if (/[",\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

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

  const csv = [header, ...rows].map((row) => row.map(csvField).join(",")).join("\n");
  // A UTF-8 BOM so Excel (still the most common opener) detects Arabic text as UTF-8 instead of guessing a local codepage.
  const bom = "\uFEFF";

  // HTTP header values must be Latin-1/ByteString — the Arabic filename can't go in
  // `filename=` directly (Response throws "Cannot convert argument to a ByteString" at
  // request time). RFC 5987's `filename*=UTF-8''<percent-encoded>` carries the real
  // Arabic name; the ASCII `filename=` fallback covers any client that ignores `filename*`.
  const filename = `ضيوف-${event.id}.csv`;

  return new Response(bom + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="guests-${event.id}.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
