import { notFound } from "next/navigation";
import { ListGuestAttendanceUseCase } from "@/features/check-in/domain/use-cases/ListGuestAttendanceUseCase";
import { makeScanRepository } from "@/features/check-in/infrastructure/factory";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import FollowUpPage from "@/features/guests/ui/FollowUpPage";
import { requireOwner } from "@/shared/lib/guard";

export const dynamic = "force-dynamic";

export default async function EventFollowUpPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;

  const eventId = Number(id);
  if (!Number.isInteger(eventId)) notFound();

  const event = await new GetEventUseCase(makeEventRepository()).execute(eventId);
  if (!event) notFound();

  const attendance = await new ListGuestAttendanceUseCase(makeScanRepository()).execute(eventId);

  return <FollowUpPage event={event} attendance={attendance} />;
}
