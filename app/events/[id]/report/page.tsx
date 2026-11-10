import { notFound } from "next/navigation";
import { makeScanRepository } from "@/features/check-in/infrastructure/factory";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { GetEventReportUseCase } from "@/features/reports/domain/use-cases/GetEventReportUseCase";
import EventReportPage from "@/features/reports/ui/EventReportPage";
import { requireOwner } from "@/shared/lib/guard";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;

  const eventId = Number(id);
  if (!Number.isInteger(eventId)) notFound();

  const report = await new GetEventReportUseCase(makeEventRepository(), makeScanRepository()).execute(eventId);
  if (!report) notFound();

  return <EventReportPage report={report} />;
}
