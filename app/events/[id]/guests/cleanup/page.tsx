import { notFound } from "next/navigation";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { FindEventDataIssuesUseCase } from "@/features/guests/domain/use-cases/FindEventDataIssuesUseCase";
import CleanupPage from "@/features/guests/ui/CleanupPage";
import { makeScanRepository } from "@/features/check-in/infrastructure/factory";
import { requireOwner } from "@/shared/lib/guard";

export const dynamic = "force-dynamic";

export default async function EventCleanupPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;

  const eventId = Number(id);
  if (!Number.isInteger(eventId)) notFound();

  const event = await new GetEventUseCase(makeEventRepository()).execute(eventId);
  if (!event) notFound();

  const report = await new FindEventDataIssuesUseCase(makeScanRepository()).execute(eventId);

  return <CleanupPage event={event} report={report} />;
}
