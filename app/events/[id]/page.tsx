import { notFound } from "next/navigation";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { requireOwner } from "@/shared/lib/guard";
import EventSettingsPage from "@/features/events/ui/EventSettingsPage";

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;

  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  const event = await new GetEventUseCase(makeEventRepository()).execute(numericId);
  if (!event) notFound();

  return <EventSettingsPage event={event} />;
}
