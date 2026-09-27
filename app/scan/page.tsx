import { notFound } from "next/navigation";
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

  // Stats are derived client-side from this same guest list (computeStatsFromGuests) —
  // see useOfflineSync — so a separate stats read here would just be redundant.
  const guests = await new ListGuestsWithStatusUseCase(makeScanRepository()).execute(eventId);

  return <Scanner event={event} initialGuests={guests} />;
}
