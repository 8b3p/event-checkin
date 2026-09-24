"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Event } from "@/features/events/domain/Event";
import { Button } from "@/shared/component/ui/button";
import { Card } from "@/shared/component/ui/card";
import { EmptyState } from "@/shared/component/empty-state";
import { ErrorNote } from "@/shared/component/error-note";
import { Input } from "@/shared/component/ui/input";
import { normalizeAr } from "@/shared/lib/normalize-ar";
import { pluralizeAr } from "@/shared/lib/pluralize-ar";
import { useDownloadGuestCardsViewModel } from "../view-model/useDownloadGuestCardsViewModel";
import type { Guest } from "../domain/Guest";
import AddGuestForm from "./AddGuestForm";
import ImportGuestsForm from "./ImportGuestsForm";

export default function GuestManager({ event, guests }: { event: Event; guests: Guest[] }) {
  const eventId = event.id;
  const [panel, setPanel] = useState<"none" | "one" | "many">("none");
  const [query, setQuery] = useState("");
  const download = useDownloadGuestCardsViewModel(event, guests);
  const downloading = download.state.status === "rendering" || download.state.status === "zipping";

  const visible = useMemo(() => {
    const needle = normalizeAr(query.trim());
    if (!needle) return guests;

    return guests.filter(
      (guest) =>
        normalizeAr(guest.name).includes(needle) ||
        normalizeAr(guest.note ?? "").includes(needle) ||
        normalizeAr(guest.code).includes(needle),
    );
  }, [guests, query]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button
          variant={panel === "one" ? "default" : "outline"}
          onClick={() => setPanel(panel === "one" ? "none" : "one")}
        >
          إضافة دعوة
        </Button>
        <Button
          variant={panel === "many" ? "default" : "outline"}
          onClick={() => setPanel(panel === "many" ? "none" : "many")}
        >
          لصق قائمة
        </Button>
      </div>

      {panel === "one" ? <AddGuestForm eventId={eventId} onDone={() => setPanel("none")} /> : null}
      {panel === "many" ? <ImportGuestsForm eventId={eventId} onDone={() => setPanel("none")} /> : null}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث بالاسم أو الملاحظة أو الرمز"
            className="max-w-xs"
          />
          <a
            href={`/events/${eventId}/guests/export`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            تصدير CSV
          </a>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-sm text-muted-foreground hover:text-foreground"
            disabled={downloading}
            onClick={download.download}
          >
            {download.state.status === "rendering"
              ? `جارٍ التحضير… (${download.state.done} / ${download.state.total})`
              : download.state.status === "zipping"
                ? "جارٍ الضغط…"
                : "تحميل كل البطاقات"}
          </Button>
          <p className="ms-auto text-sm text-muted-foreground tabular">
            {visible.length} من {guests.length}
          </p>
        </div>

        {download.state.status === "error" ? (
          <div className="border-b border-border px-5 py-4">
            <ErrorNote>{download.state.message}</ErrorNote>
          </div>
        ) : null}

        {guests.length === 0 ? (
          <EmptyState
            title="لا توجد دعوات بعد"
            body="أضف دعوة واحدة، أو الصق قائمتك الكاملة دفعة واحدة — اسم واحد في كل سطر."
          />
        ) : visible.length === 0 ? (
          <EmptyState title="لا توجد نتائج" body="جرّب بحثاً مختلفاً." />
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((guest) => (
              <li key={guest.id}>
                <Link
                  href={`/events/${eventId}/guests/${guest.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{guest.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {pluralizeAr(guest.seats, { one: "مقعد واحد", two: "مقعدان", few: "مقاعد", many: "مقعد" })}
                      {guest.note ? ` · ${guest.note}` : ""}
                    </p>
                  </div>
                  <span aria-hidden className="text-muted-foreground">
                    ‹
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
