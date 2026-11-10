import Link from "next/link";
import type { ReactNode } from "react";
import type { GuestAttendanceRow } from "@/features/check-in/domain/ScanEvent";
import { Shell, PageHeading } from "@/shared/component/Shell";
import { Badge } from "@/shared/component/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/component/ui/card";
import { pluralizeAr } from "@/shared/lib/pluralize-ar";
import { ATTENDANCE_STATUS_LABEL } from "../domain/attendanceCsvRows";
import type { EventReport } from "../domain/EventReport";
import ArrivalsChart from "./ArrivalsChart";
import LocalTime from "./LocalTime";
import ReportActions from "./ReportActions";
import ScanLog from "./ScanLog";

const invitations = (n: number) => pluralizeAr(n, { one: "دعوة واحدة", two: "دعوتان", few: "دعوات", many: "دعوة" });
const seats = (n: number) => pluralizeAr(n, { one: "مقعد واحد", two: "مقعدان", few: "مقاعد", many: "مقعداً" });
const people = (n: number) => pluralizeAr(n, { one: "شخص واحد", two: "شخصان", few: "أشخاص", many: "شخصاً" });

function formatEventDate(eventDate: string | null): string | undefined {
  if (!eventDate) return undefined;
  return new Date(`${eventDate}T00:00:00`).toLocaleDateString("ar-u-nu-latn", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function Stat({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <Card className="gap-1 p-5 break-inside-avoid">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="display text-3xl text-foreground tabular">{value}</p>
      {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
    </Card>
  );
}

function StatusBadge({ row }: { row: GuestAttendanceRow }) {
  const tone =
    row.status === "full"
      ? "bg-good-soft text-good-ink"
      : row.status === "partial"
        ? "bg-warn-soft text-warn-ink"
        : "bg-bad-soft text-bad-ink";
  return <Badge className={`border-transparent ${tone}`}>{ATTENDANCE_STATUS_LABEL[row.status]}</Badge>;
}

/** Arrivals in the order they came, then the no-shows by name. */
function orderForReport(guests: GuestAttendanceRow[]): GuestAttendanceRow[] {
  return [...guests].sort((a, b) => {
    if (a.firstInAt && b.firstInAt) return a.firstInAt.getTime() - b.firstInAt.getTime();
    if (a.firstInAt) return -1;
    if (b.firstInAt) return 1;
    return a.name.localeCompare(b.name, "ar");
  });
}

export default function EventReportPage({ report }: { report: EventReport }) {
  const { event, summary, peak } = report;

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

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="نسبة الحضور"
          value={summary.turnout === null ? "—" : `${Math.round(summary.turnout * 100)}%`}
          detail={`${summary.arrivedSeats} من ${seats(summary.invitedSeats)} مدعوة`}
        />
        <Stat
          label="عبر الباب"
          value={summary.peopleThroughDoor}
          detail={
            summary.extraSeats > 0
              ? `منهم ${summary.extraSeats} فوق عدد الدعوة`
              : "كل من دخل، بمن فيهم بدون دعوة"
          }
        />
        <Stat
          label="لم يحضروا"
          value={summary.noShowGuests}
          detail={summary.noShowGuests > 0 ? `${invitations(summary.noShowGuests)} · ${seats(summary.noShowSeats)}` : "حضرت كل الدعوات"}
        />
        <Stat
          label="بدون دعوة مسبقة"
          value={summary.walkInGuests}
          detail={summary.walkInSeats > 0 ? seats(summary.walkInSeats) : undefined}
        />
      </section>

      {summary.partialGuests > 0 || summary.stillInsideGuests > 0 ? (
        <div className="mt-4 space-y-1 text-sm text-muted-foreground">
          {summary.partialGuests > 0 ? (
            <p>
              {invitations(summary.partialGuests)} حضرت جزئياً، وغاب منها {people(summary.missingSeats)}.
            </p>
          ) : null}
          {summary.stillInsideGuests > 0 ? (
            <p>
              {invitations(summary.stillInsideGuests)} لم تُسجَّل مغادرتها، لذلك أوقات الخروج غير مكتملة.
            </p>
          ) : null}
        </div>
      ) : null}

      <Card className="mt-6 break-inside-avoid">
        <CardHeader>
          <CardTitle>توقيت الوصول</CardTitle>
          <CardDescription>
            {peak ? (
              <>
                الذروة عند <LocalTime value={peak.minute} /> — {seats(peak.seats)} خلال ربع ساعة.{" "}
              </>
            ) : null}
            {summary.firstArrivalAt ? (
              <>
                أول وصول <LocalTime value={summary.firstArrivalAt} />، وآخر وصول{" "}
                <LocalTime value={summary.lastArrivalAt} />.
              </>
            ) : null}
          </CardDescription>
        </CardHeader>
        <ArrivalsChart buckets={report.arrivals} />
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>الضيوف</CardTitle>
          <CardDescription>
            {summary.fullGuests} حضروا كاملين · {summary.partialGuests} جزئياً · {summary.noShowGuests} لم يحضروا
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 text-start font-medium">الاسم</th>
                  <th className="px-3 py-2 text-start font-medium">الحالة</th>
                  <th className="px-3 py-2 text-start font-medium">من حضر</th>
                  <th className="px-3 py-2 text-start font-medium">أول دخول</th>
                  <th className="px-3 py-2 text-start font-medium">آخر خروج</th>
                </tr>
              </thead>
              <tbody>
                {orderForReport(report.guests).map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-b-0 break-inside-avoid">
                    <td className="px-5 py-2.5 text-foreground">
                      {row.name}
                      {row.source === "walk_in" ? (
                        <span className="ms-2 text-xs text-muted-foreground">بدون دعوة</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge row={row} />
                    </td>
                    <td className="px-3 py-2.5 tabular">
                      {Math.min(row.peakInsideSeats, row.seats)} من {row.seats}
                      {row.peakInsideSeats > row.seats ? (
                        <span className="ms-1.5 text-xs text-warn-ink">+{row.peakInsideSeats - row.seats}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <LocalTime value={row.firstInAt} />
                    </td>
                    <td className="px-3 py-2.5">
                      <LocalTime value={row.lastOutAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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
