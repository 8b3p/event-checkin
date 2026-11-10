import type { ReactNode } from "react";
import { Badge } from "@/shared/component/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/component/ui/card";
import { pluralizeAr } from "@/shared/lib/pluralize-ar";
import { ATTENDANCE_STATUS_LABEL } from "../domain/attendanceCsvRows";
import type { ReportGuestRow, ReportView } from "../domain/EventReport";
import { formatDuration } from "../domain/formatDuration";
import ArrivalsChart from "./ArrivalsChart";
import LocalTime from "./LocalTime";
import OccupancyChart from "./OccupancyChart";

const invitations = (n: number) => pluralizeAr(n, { one: "دعوة واحدة", two: "دعوتان", few: "دعوات", many: "دعوة" });
const seats = (n: number) => pluralizeAr(n, { one: "مقعد واحد", two: "مقعدان", few: "مقاعد", many: "مقعداً" });
const people = (n: number) => pluralizeAr(n, { one: "شخص واحد", two: "شخصان", few: "أشخاص", many: "شخصاً" });

export function formatEventDate(eventDate: string | null): string | undefined {
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

function StatusBadge({ row }: { row: ReportGuestRow }) {
  const tone =
    row.status === "full"
      ? "bg-good-soft text-good-ink"
      : row.status === "partial"
        ? "bg-warn-soft text-warn-ink"
        : "bg-bad-soft text-bad-ink";
  return <Badge className={`border-transparent ${tone}`}>{ATTENDANCE_STATUS_LABEL[row.status]}</Badge>;
}

/** Arrivals in the order they came, then the no-shows by name. */
function orderForReport(guests: ReportGuestRow[]): ReportGuestRow[] {
  return [...guests].sort((a, b) => {
    if (a.firstInAt && b.firstInAt) return a.firstInAt.getTime() - b.firstInAt.getTime();
    if (a.firstInAt) return -1;
    if (b.firstInAt) return 1;
    return a.name.localeCompare(b.name, "ar");
  });
}

/**
 * Every section of the after-event report that both the owner and a shared
 * link show. It only ever sees a ReportView, so it cannot render a phone
 * number, a guest code or the door log — those are not in its input.
 */
export default function ReportSections({ view }: { view: ReportView }) {
  const { summary, peak } = view;

  return (
    <>
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
        <ArrivalsChart buckets={view.arrivals} />
      </Card>

      <OccupancySection view={view} />
      <DwellSection view={view} />

      {view.guests ? <GuestSheet guests={view.guests} summary={summary} /> : null}
    </>
  );
}

function OccupancySection({ view }: { view: ReportView }) {
  const { occupancy, summary } = view;
  const { peak, overCapacity, capacity } = occupancy;

  return (
    <Card className="mt-6 break-inside-avoid">
      <CardHeader>
        <CardTitle>عدد الموجودين داخل القاعة</CardTitle>
        <CardDescription>
          {peak ? (
            <>
              بلغ العدد ذروته عند <LocalTime value={peak.at} /> بـ {people(peak.inside)}.{" "}
            </>
          ) : null}
          {capacity !== null && peak ? (
            overCapacity ? (
              <span className="text-bad-ink">
                تجاوز العدد السعة ({capacity}) ابتداءً من <LocalTime value={overCapacity.firstAt} />
                {overCapacity.minutes >= 1 ? <>، لمدة {formatDuration(overCapacity.minutes)} في المجموع</> : null}، وبلغ
                التجاوز {people(overCapacity.peakExcess)}.
                {overCapacity.stillOverAtEnd ? " وكان العدد لا يزال فوق السعة عند آخر مسح." : ""}
              </span>
            ) : (
              <>لم يتجاوز العدد السعة ({capacity}).</>
            )
          ) : null}
        </CardDescription>
      </CardHeader>
      <OccupancyChart points={occupancy.points} capacity={capacity} />
      {peak ? (
        <p className="px-5 pb-5 text-xs text-muted-foreground">
          {occupancy.stillInside > 0
            ? `هذه حدود قصوى لا أرقام دقيقة: ${people(occupancy.stillInside)} (${invitations(summary.stillInsideGuests)}) لم تُسجَّل مغادرتهم، فيُحسبون داخل القاعة حتى آخر مسح. الرقم الفعلي قد يكون أقل.`
            : "سُجّلت مغادرة كل من دخل، فالأرقام أعلاه دقيقة."}
        </p>
      ) : null}
    </Card>
  );
}

function DwellSection({ view }: { view: ReportView }) {
  const { dwell } = view;
  const showNames = view.guests !== null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>مدة البقاء</CardTitle>
        <CardDescription>
          {dwell.measuredParties > 0
            ? `محسوبة من ${invitations(dwell.measuredParties)} سُجّل دخولها وخروجها الكامل، من أصل ${invitations(dwell.arrivedParties)} حضرت. المدة من أول دخول إلى آخر خروج.`
            : dwell.arrivedParties > 0
              ? "لم تُسجَّل مغادرة كاملة لأي دعوة، فلا يمكن حساب مدة البقاء."
              : "لم يحضر أحد بعد."}
        </CardDescription>
      </CardHeader>

      {dwell.measuredParties > 0 && dwell.averageMinutes !== null && dwell.medianMinutes !== null ? (
        <CardContent>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="المتوسط" value={<DurationValue minutes={dwell.averageMinutes} />} />
            <Stat label="الوسيط" value={<DurationValue minutes={dwell.medianMinutes} />} />
            {dwell.shortest ? (
              <Stat
                label="الأقصر"
                value={<DurationValue minutes={dwell.shortest.minutes} />}
                detail={showNames ? dwell.shortest.name : undefined}
              />
            ) : null}
            {dwell.longest ? (
              <Stat
                label="الأطول"
                value={<DurationValue minutes={dwell.longest.minutes} />}
                detail={showNames ? dwell.longest.name : undefined}
              />
            ) : null}
          </div>

          <h3 className="mt-6 text-sm font-medium text-foreground">غادروا مبكراً</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            الدعوات التي خرجت قبل أكثر من {formatDuration(dwell.earlyLeaverMinutes)} من آخر مسح في الليلة
            {dwell.lastScanAt ? (
              <>
                {" "}
                (<LocalTime value={dwell.lastScanAt} />)
              </>
            ) : null}
            .
          </p>

          {dwell.earlyLeavers.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">لم تغادر أي دعوة مبكراً.</p>
          ) : (
            <div className="-mx-6 mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    {showNames ? <th className="px-6 py-2 text-start font-medium">الاسم</th> : null}
                    <th className="px-3 py-2 text-start font-medium">من غادر</th>
                    <th className="px-3 py-2 text-start font-medium">وقت الخروج</th>
                    <th className="px-3 py-2 text-start font-medium">مدة البقاء</th>
                    <th className="px-3 py-2 text-start font-medium">قبل آخر مسح بـ</th>
                  </tr>
                </thead>
                <tbody>
                  {dwell.earlyLeavers.map((leaver) => (
                    <tr key={leaver.guestId} className="border-b border-border last:border-b-0 break-inside-avoid">
                      {showNames ? <td className="px-6 py-2.5 text-foreground">{leaver.name}</td> : null}
                      <td className="px-3 py-2.5 tabular">{people(leaver.seats)}</td>
                      <td className="px-3 py-2.5">
                        <LocalTime value={leaver.leftAt} />
                      </td>
                      <td className="px-3 py-2.5">{formatDuration(leaver.stayMinutes)}</td>
                      <td className="px-3 py-2.5">{formatDuration(leaver.minutesBeforeEnd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      ) : null}
    </Card>
  );
}

/** A stay in the big-number slot: smaller than a count, since it is a phrase ("ساعتان و5 دقائق"). */
function DurationValue({ minutes }: { minutes: number }) {
  return <span className="text-xl">{formatDuration(minutes)}</span>;
}

function GuestSheet({ guests, summary }: { guests: ReportGuestRow[]; summary: ReportView["summary"] }) {
  return (
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
              {orderForReport(guests).map((row) => (
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
  );
}
