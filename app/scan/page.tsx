import { notFound } from "next/navigation";
import { GetEventStatsUseCase } from "@/features/check-in/domain/use-cases/GetEventStatsUseCase";
import { ListGuestsWithStatusUseCase } from "@/features/check-in/domain/use-cases/ListGuestsWithStatusUseCase";
import { makeScanRepository } from "@/features/check-in/infrastructure/factory";
import Scanner from "@/features/check-in/ui/Scanner";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { requireDoor } from "@/shared/lib/guard";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const eventId = await requireDoor();

  const event = await new GetEventUseCase(makeEventRepository()).execute(eventId);
  if (!event) notFound();

  const scanRepository = makeScanRepository();
  const [stats, guests] = await Promise.all([
    new GetEventStatsUseCase(scanRepository).execute(eventId),
    new ListGuestsWithStatusUseCase(scanRepository).execute(eventId),
  ]);

  return <Scanner event={event} initialStats={stats} initialGuests={guests} />;
}
