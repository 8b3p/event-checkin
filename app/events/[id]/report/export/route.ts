import { notFound } from "next/navigation";
import { ListGuestAttendanceUseCase } from "@/features/check-in/domain/use-cases/ListGuestAttendanceUseCase";
import { makeScanRepository } from "@/features/check-in/infrastructure/factory";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { attendanceCsvRows, resolveTimeZone } from "@/features/reports/domain/attendanceCsvRows";
import { csvResponse } from "@/shared/lib/csv";
import { requireOwner } from "@/shared/lib/guard";

/** `?tz=` is the owner's browser timezone, so arrival times read as the wall clock at the venue. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;

  const eventId = Number(id);
  if (!Number.isInteger(eventId)) notFound();

  const event = await new GetEventUseCase(makeEventRepository()).execute(eventId);
  if (!event) notFound();

  const guests = await new ListGuestAttendanceUseCase(makeScanRepository()).execute(eventId);
  const timeZone = resolveTimeZone(new URL(request.url).searchParams.get("tz"));

  return csvResponse(attendanceCsvRows(guests, timeZone), `attendance-${event.id}.csv`, `حضور-${event.id}.csv`);
}
