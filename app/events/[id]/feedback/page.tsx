import { notFound } from "next/navigation";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { summarizeFeedback } from "@/features/feedback/domain/summarizeFeedback";
import { ListFeedbackForEventUseCase } from "@/features/feedback/domain/use-cases/ListFeedbackForEventUseCase";
import { makeFeedbackRepository } from "@/features/feedback/infrastructure/factory";
import FeedbackPage from "@/features/feedback/ui/FeedbackPage";
import { requireOwner } from "@/shared/lib/guard";

export const dynamic = "force-dynamic";

export default async function EventFeedbackPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;

  const eventId = Number(id);
  if (!Number.isInteger(eventId)) notFound();

  const event = await new GetEventUseCase(makeEventRepository()).execute(eventId);
  if (!event) notFound();

  const items = await new ListFeedbackForEventUseCase(makeFeedbackRepository()).execute(eventId);

  return <FeedbackPage event={event} items={items} summary={summarizeFeedback(items)} />;
}
