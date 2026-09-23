"use client";

import { useMemo, useState } from "react";
import { Button } from "@/shared/component/ui/button";
import { Card } from "@/shared/component/ui/card";
import { EmptyState } from "@/shared/component/empty-state";
import { Input } from "@/shared/component/ui/input";
import { normalizeAr } from "@/shared/lib/normalize-ar";
import { pluralizeAr } from "@/shared/lib/pluralize-ar";
import type { GuestWithStatus } from "@/features/check-in/domain/ScanEvent";
import type { WalkInGuest } from "@/app/scan/actions";
import AddWalkInForm from "./AddWalkInForm";

type StatusFilter = "all" | "inside" | "outside";

export default function GuestSearchPanel({
  guests,
  onResolve,
  onGuestAdded,
}: {
  guests: GuestWithStatus[];
  onResolve: (guestId: number) => void;
  onGuestAdded: (guest: GuestWithStatus) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [addingWalkIn, setAddingWalkIn] = useState(false);

  const visible = useMemo(() => {
    const needle = normalizeAr(query.trim());
    return guests.filter((guest) => {
      if (status === "inside" && guest.insideSeats <= 0) return false;
      if (status === "outside" && guest.insideSeats > 0) return false;
      if (!needle) return true;
      return normalizeAr(guest.name).includes(needle) || normalizeAr(guest.note ?? "").includes(needle) || normalizeAr(guest.code).includes(needle);
    });
  }, [guests, query, status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم أو الرمز" className="max-w-xs" autoFocus />
        <div className="flex gap-1">
          {(
            [
              { key: "all", label: "الكل" },
              { key: "inside", label: "بالداخل" },
              { key: "outside", label: "بالخارج" },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setStatus(option.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${status === option.key ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Button type="button" variant={addingWalkIn ? "default" : "outline"} className="ms-auto" onClick={() => setAddingWalkIn((v) => !v)}>
          ضيف بدون دعوة
        </Button>
      </div>

      {addingWalkIn ? (
        <AddWalkInForm
          onAdded={(guest: WalkInGuest) => onGuestAdded({ ...guest })}
          onDone={() => setAddingWalkIn(false)}
        />
      ) : null}

      <Card>
        {guests.length === 0 ? (
          <EmptyState title="لا توجد دعوات بعد" body="أضف ضيفاً بدون دعوة، أو ارجع للمالك لإضافة الدعوات." />
        ) : visible.length === 0 ? (
          <EmptyState title="لا توجد نتائج" body="جرّب بحثاً مختلفاً." />
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((guest) => {
              const outside = guest.insideSeats <= 0;
              const full = guest.insideSeats >= guest.seats;
              const label = outside ? "خارج" : full ? "بالداخل" : `${guest.insideSeats}/${guest.seats} بالداخل`;

              return (
                <li key={guest.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{guest.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {pluralizeAr(guest.seats, { one: "مقعد واحد", two: "مقعدان", few: "مقاعد", many: "مقعد" })} · {label}
                      {guest.phone ? ` · ${guest.phone}` : ""}
                      {guest.note ? ` · ${guest.note}` : ""}
                    </p>
                  </div>
                  <Button type="button" size="sm" onClick={() => onResolve(guest.id)}>
                    {outside ? "تسجيل دخول" : "تسجيل خروج"}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
