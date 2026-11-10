"use client";

import { EmptyState } from "@/shared/component/empty-state";
import { Button } from "@/shared/component/ui/button";
import { Card, CardContent } from "@/shared/component/ui/card";
import { Textarea } from "@/shared/component/ui/textarea";
import { pluralizeAr } from "@/shared/lib/pluralize-ar";
import { FOLLOW_UP_FILTERS, type FollowUpFilter, type FollowUpGuest } from "../domain/followUps";
import { useFollowUpViewModel } from "../view-model/useFollowUpViewModel";

const FILTER_LABELS: Record<FollowUpFilter, string> = {
  attended: "حضروا",
  partial: "حضروا جزئياً",
  no_show: "لم يحضروا",
  walk_in: "بدون دعوة",
};

const FILTER_HINTS: Record<FollowUpFilter, string> = {
  attended: "دعوات دخل كل أفرادها — حتى لو غادروا لاحقاً.",
  partial: "دعوات دخل بعض أفرادها فقط.",
  no_show: "دعوات لم يُسجَّل دخول أحد منها.",
  walk_in: "ضيوف أُضيفوا عند الباب.",
};

function attendanceLabel(guest: FollowUpGuest, filter: FollowUpFilter): string {
  if (filter === "no_show") {
    return pluralizeAr(guest.seats, { one: "مقعد واحد", two: "مقعدان", few: "مقاعد", many: "مقعد" });
  }
  return `حضر ${guest.peakInsideSeats} من ${guest.seats}`;
}

export default function FollowUpList({ guests }: { guests: FollowUpGuest[] }) {
  const vm = useFollowUpViewModel(guests);

  return (
    <div className="space-y-5">
      <div role="tablist" aria-label="تصفية حسب الحضور" className="flex flex-wrap gap-2">
        {FOLLOW_UP_FILTERS.map((filter) => (
          <Button
            key={filter}
            role="tab"
            aria-selected={vm.filter === filter}
            variant={vm.filter === filter ? "default" : "outline"}
            onClick={() => vm.setFilter(filter)}
          >
            {FILTER_LABELS[filter]}
            <span className="tabular opacity-80">{vm.counts[filter]}</span>
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-2">
          <label htmlFor="follow-up-template" className="text-sm font-medium text-foreground">
            {vm.kind === "missed" ? "رسالة «افتقدناكم»" : "رسالة الشكر"}
          </label>
          <Textarea
            id="follow-up-template"
            value={vm.template}
            onChange={(event) => vm.setTemplate(event.target.value)}
            rows={3}
          />
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs text-muted-foreground">
              اكتب <bdi className="font-mono">{"{name}"}</bdi> حيث يظهر اسم الضيف. يُحفظ النص في هذا المتصفح.
            </p>
            <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={vm.resetTemplate}>
              استعادة النص الأصلي
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
          <p className="text-sm text-muted-foreground">{FILTER_HINTS[vm.filter]}</p>
          <div className="ms-auto flex flex-wrap items-center gap-3">
            {vm.withoutPhone > 0 ? (
              <p className="text-sm text-warn-ink tabular">
                {pluralizeAr(vm.withoutPhone, {
                  one: "ضيف واحد بلا رقم هاتف",
                  two: "ضيفان بلا رقم هاتف",
                  few: "ضيوف بلا رقم هاتف",
                  many: "ضيفاً بلا رقم هاتف",
                })}
              </p>
            ) : null}
            <Button variant="outline" size="sm" disabled={vm.numberCount === 0} onClick={vm.copyNumbers}>
              {vm.copied ? "تم النسخ" : `نسخ كل الأرقام (${vm.numberCount})`}
            </Button>
          </div>
        </div>

        {vm.rows.length === 0 ? (
          <EmptyState title="لا أحد في هذه القائمة" body="جرّب تصفية أخرى." />
        ) : (
          <ul className="divide-y divide-border">
            {vm.rows.map(({ guest, whatsapp }) => (
              <li key={guest.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{guest.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {attendanceLabel(guest, vm.filter)}
                    {guest.phone ? (
                      <>
                        {" · "}
                        <bdi dir="ltr">{guest.phone}</bdi>
                      </>
                    ) : null}
                  </p>
                </div>
                {whatsapp ? (
                  <a
                    href={whatsapp}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 shrink-0 items-center rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-muted"
                  >
                    واتساب
                  </a>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">لا يوجد رقم</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
