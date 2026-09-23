import { requireOwner } from "@/shared/lib/guard";
import { GetEventStatsUseCase } from "@/features/check-in/domain/use-cases/GetEventStatsUseCase";
import { ListEventsUseCase } from "@/features/events/domain/use-cases/ListEventsUseCase";
import { makeScanRepository } from "@/features/check-in/infrastructure/factory";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import EventListPage, { type EventWithStats } from "@/features/events/ui/EventListPage";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await requireOwner();

  const events = await new ListEventsUseCase(makeEventRepository()).execute();
  const scanRepository = makeScanRepository();
  const eventsWithStats: EventWithStats[] = await Promise.all(
    events.map(async (event) => ({
      event,
      stats: await new GetEventStatsUseCase(scanRepository).execute(event.id),
    })),
  );

  return <EventListPage events={eventsWithStats} />;
}
