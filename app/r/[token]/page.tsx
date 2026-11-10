import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { makeScanRepository } from "@/features/check-in/infrastructure/factory";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { GetSharedReportUseCase } from "@/features/reports/domain/use-cases/ReportShareUseCases";
import { makeReportShareRepository } from "@/features/reports/infrastructure/factory";
import SharedReportPage from "@/features/reports/ui/SharedReportPage";

// Revoking a link must take effect on the next request, so this is never cached.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "تقرير الفعالية",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

/** Public and read-only: no login, and the token in the URL is the only credential. */
export default async function SharedReportRoute({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const view = await new GetSharedReportUseCase(
    makeReportShareRepository(),
    makeEventRepository(),
    makeScanRepository(),
  ).execute(token);
  if (!view) notFound();

  return <SharedReportPage view={view} />;
}
