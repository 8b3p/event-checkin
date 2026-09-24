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

type SortField = "name" | "seats" | "note" | "code" | "createdAt";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: "name", label: "الاسم" },
  { value: "seats", label: "المقاعد" },
  { value: "note", label: "الملاحظة" },
  { value: "code", label: "الرمز" },
  { value: "createdAt", label: "تاريخ الإضافة" },
];

function compareGuests(a: Guest, b: Guest, field: SortField): number {
  switch (field) {
    case "seats":
      return a.seats - b.seats;
    case "createdAt":
      return a.createdAt.getTime() - b.createdAt.getTime();
    case "note":
      return (a.note ?? "").localeCompare(b.note ?? "", "ar");
    case "code":
      return a.code.localeCompare(b.code, "ar");
    case "name":
      return a.name.localeCompare(b.name, "ar");
  }
}

export default function GuestManager({ event, guests }: { event: Event; guests: Guest[] }) {
  const eventId = event.id;
  const [panel, setPanel] = useState<"none" | "one" | "many">("none");
  const [query, setQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const visible = useMemo(() => {
    const needle = normalizeAr(query.trim());
    const filtered = !needle
      ? guests
      : guests.filter(
          (guest) =>
            normalizeAr(guest.name).includes(needle) ||
            normalizeAr(guest.note ?? "").includes(needle) ||
            normalizeAr(guest.code).includes(needle) ||
            String(guest.seats).includes(needle),
        );

    const sign = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => sign * compareGuests(a, b, sortField));
  }, [guests, query, sortField, sortDir]);

  const download = useDownloadGuestCardsViewModel(event, visible);
  const downloading = download.state.status === "rendering" || download.state.status === "zipping";

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
            placeholder="ابحث بالاسم أو الملاحظة أو الرمز أو المقاعد"
            className="max-w-xs"
          />
          <div className="flex items-center gap-1.5">
            <select
              value={sortField}
              onChange={(event) => setSortField(event.target.value as SortField)}
              aria-label="ترتيب حسب"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))}
              aria-label={sortDir === "asc" ? "ترتيب تصاعدي" : "ترتيب تنازلي"}
              title={sortDir === "asc" ? "تصاعدي" : "تنازلي"}
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </Button>
          </div>
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
            disabled={downloading || visible.length === 0}
            onClick={download.download}
          >
            {download.state.status === "rendering"
              ? `جارٍ التحضير… (${download.state.done} / ${download.state.total})`
              : download.state.status === "zipping"
                ? "جارٍ الضغط…"
                : visible.length === guests.length
                  ? "تحميل كل البطاقات"
                  : `تحميل البطاقات (${visible.length})`}
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
