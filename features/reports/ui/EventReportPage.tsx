import Link from "next/link";
import { Shell, PageHeading } from "@/shared/component/Shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/component/ui/card";
import { buildReportView } from "../domain/buildReportView";
import type { EventReport } from "../domain/EventReport";
import type { ReportShare } from "../domain/ReportShare";
import ReportActions from "./ReportActions";
import ReportSections, { formatEventDate } from "./ReportSections";
import ReportShareControls from "./ReportShareControls";
import ScanLog from "./ScanLog";

/** The owner's report: every shared section, plus the share controls and the full door log. */
export default function EventReportPage({ report, share }: { report: EventReport; share: ReportShare | null }) {
  const { event, summary } = report;

  return (
    <Shell>
      <Link href={`/events/${event.id}`} className="text-sm text-muted-foreground hover:text-foreground print:hidden">
        ‹ رجوع إلى {event.name}
      </Link>

      <div className="mt-3">
        <PageHeading
          title={`تقرير ${event.name}`}
          hint={[formatEventDate(event.eventDate), event.venue].filter(Boolean).join(" · ") || undefined}
          action={<ReportActions eventId={event.id} />}
        />
      </div>

      <ReportShareControls
        eventId={event.id}
        token={share?.token ?? null}
        sharedAt={share?.sharedAt.toISOString() ?? null}
        showNames={share?.showNames ?? false}
      />

      <ReportSections view={buildReportView(report, true)} />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>سجل الباب</CardTitle>
          <CardDescription>
            {summary.peopleThroughDoor > 0
              ? `${report.scanSummary.checkIns} دخول · ${report.scanSummary.checkOuts} خروج · ${report.scanSummary.overrides} تجاوز · ${report.scanSummary.manual} يدوي`
              : "لم يُسجَّل أي مسح بعد."}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <ScanLog scans={report.scans} summary={report.scanSummary} />
        </CardContent>
      </Card>
    </Shell>
  );
}
