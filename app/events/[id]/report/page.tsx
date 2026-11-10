import { notFound } from "next/navigation";
import { makeScanRepository } from "@/features/check-in/infrastructure/factory";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { GetEventReportUseCase } from "@/features/reports/domain/use-cases/GetEventReportUseCase";
import { GetReportShareUseCase } from "@/features/reports/domain/use-cases/ReportShareUseCases";
import { makeReportShareRepository } from "@/features/reports/infrastructure/factory";
import EventReportPage from "@/features/reports/ui/EventReportPage";
import { requireOwner } from "@/shared/lib/guard";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;

  const eventId = Number(id);
  if (!Number.isInteger(eventId)) notFound();

  const [report, share] = await Promise.all([
    new GetEventReportUseCase(makeEventRepository(), makeScanRepository()).execute(eventId),
    new GetReportShareUseCase(makeReportShareRepository()).execute(eventId),
  ]);
  if (!report) notFound();

  return <EventReportPage report={report} share={share} />;
}
