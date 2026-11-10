import Link from "next/link";
import { EmptyState } from "@/shared/component/empty-state";
import { Shell, PageHeading } from "@/shared/component/Shell";
import { Badge } from "@/shared/component/ui/badge";
import { Card, CardHeader, CardTitle } from "@/shared/component/ui/card";
import type { Event } from "@/features/events/domain/Event";
import { pluralizeAr } from "@/shared/lib/pluralize-ar";
import type { CleanupGuest, DataQualityReport, MatchReason } from "../domain/dataQuality";
import GuestsSubnav from "./GuestsSubnav";
import MergePanel from "./MergePanel";

const REASON_LABELS: Record<MatchReason, string> = {
  name: "نفس الاسم",
  phone: "نفس الهاتف",
};

function Reasons({ reasons }: { reasons: MatchReason[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {reasons.map((reason) => (
        <Badge key={reason} variant="secondary">
          {REASON_LABELS[reason]}
        </Badge>
      ))}
    </div>
  );
}

function GuestLine({ eventId, guest }: { eventId: number; guest: CleanupGuest }) {
  return (
    <div className="min-w-0 flex-1">
      <Link
        href={`/events/${eventId}/guests/${guest.id}`}
        className="block truncate text-sm font-medium text-foreground hover:underline"
      >
        {guest.name}
      </Link>
      <p className="truncate text-xs text-muted-foreground">
        {guest.source === "walk_in" ? "بدون دعوة" : "مدعو"}
        {" · "}
        {pluralizeAr(guest.seats, { one: "مقعد واحد", two: "مقعدان", few: "مقاعد", many: "مقعد" })}
        {guest.phone ? (
          <>
            {" · "}
            <bdi dir="ltr">{guest.phone}</bdi>
          </>
        ) : null}
        {guest.note ? ` · ${guest.note}` : ""}
      </p>
    </div>
  );
}

export default function CleanupPage({ event, report }: { event: Event; report: DataQualityReport }) {
  const { stillInside, duplicates, walkInMatches } = report;
  const clean = stillInside.length === 0 && duplicates.length === 0 && walkInMatches.length === 0;

  return (
    <Shell>
      <Link href={`/events/${event.id}`} className="text-sm text-muted-foreground hover:text-foreground">
        ‹ رجوع إلى {event.name}
      </Link>

      <div className="mt-3">
        <PageHeading title="الضيوف" hint="مراجعة الأخطاء المحتملة في البيانات قبل الاعتماد على التقرير." />
      </div>

      <GuestsSubnav eventId={event.id} current="cleanup" />

      <div className="space-y-5">
        {clean ? (
          <Card>
            <EmptyState title="لا توجد ملاحظات" body="لم نجد ضيوفاً عالقين بالداخل ولا أسماء مكررة ولا ضيوفاً بلا دعوة يشبهون مدعوين." />
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>ما زالوا بالداخل</CardTitle>
            <p className="text-sm text-muted-foreground">
              سُجّل دخولهم ولم يُسجَّل خروجهم، فبيانات الخروج ناقصة لهم. لا نضيف أي خروج تلقائياً، فتبقى هذه الأرقام
              كما سُجّلت عند الباب.
            </p>
          </CardHeader>
          {stillInside.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">لا أحد.</p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {stillInside.map((guest) => (
                <li key={guest.id} className="flex items-center gap-4 px-5 py-3.5">
                  <GuestLine eventId={event.id} guest={guest} />
                  <Badge variant="outline" className="tabular">
                    بالداخل: {guest.insideSeats} من {guest.seats}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>تكرارات محتملة</CardTitle>
            <p className="text-sm text-muted-foreground">
              دعوات بنفس الاسم أو الهاتف. قد تكون دعوتين لشخصين مختلفين، فتأكد قبل الدمج.
            </p>
          </CardHeader>
          {duplicates.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">لا شيء.</p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {duplicates.map((group) => (
                <li key={group.guests.map((guest) => guest.id).join("-")} className="space-y-3 px-5 py-4">
                  <Reasons reasons={group.reasons} />
                  <ul className="space-y-2">
                    {group.guests.map((guest) => (
                      <li key={guest.id} className="flex items-center gap-4">
                        <GuestLine eventId={event.id} guest={guest} />
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2">
                    {group.guests.slice(1).map((guest) => (
                      <MergePanel
                        key={guest.id}
                        eventId={event.id}
                        first={group.guests[0]}
                        second={guest}
                        label={`دمج ${group.guests[0].name} و${guest.name}`}
                      />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ضيوف بدون دعوة يشبهون مدعوين</CardTitle>
            <p className="text-sm text-muted-foreground">
              أُضيفوا عند الباب لكن اسمهم أو هاتفهم يطابق دعوة قائمة. الدمج يوحّد حضورهم في دعوتهم الأصلية.
            </p>
          </CardHeader>
          {walkInMatches.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">لا شيء.</p>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {walkInMatches.map(({ walkIn, matches }) => (
                <li key={walkIn.id} className="space-y-3 px-5 py-4">
                  <div className="flex items-center gap-4">
                    <GuestLine eventId={event.id} guest={walkIn} />
                  </div>
                  {matches.map(({ guest, reasons }) => (
                    <div key={guest.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-muted px-3 py-2">
                      <span className="text-xs text-muted-foreground">يشبه</span>
                      <GuestLine eventId={event.id} guest={guest} />
                      <Reasons reasons={reasons} />
                      <MergePanel eventId={event.id} first={walkIn} second={guest} label="دمج" />
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Shell>
  );
}
