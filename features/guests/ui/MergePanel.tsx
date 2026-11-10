"use client";

import { ErrorNote } from "@/shared/component/error-note";
import { Button } from "@/shared/component/ui/button";
import type { CleanupGuest, MergeFieldPicks, MergePick } from "../domain/dataQuality";
import { useMergeGuestsViewModel } from "../view-model/useMergeGuestsViewModel";

function GuestSummary({ role, guest }: { role: string; guest: CleanupGuest }) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-border bg-muted p-3">
      <p className="text-xs text-muted-foreground">{role}</p>
      <p className="truncate text-sm font-medium text-foreground">{guest.name}</p>
      <p className="truncate text-xs text-muted-foreground">
        {guest.source === "walk_in" ? "بدون دعوة" : "مدعو"}
        {guest.phone ? (
          <>
            {" · "}
            <bdi dir="ltr">{guest.phone}</bdi>
          </>
        ) : null}
      </p>
    </div>
  );
}

function PickField({
  label,
  field,
  keepValue,
  mergeValue,
  value,
  onPick,
}: {
  label: string;
  field: keyof MergeFieldPicks;
  keepValue: string | null;
  mergeValue: string | null;
  value: MergePick;
  onPick: (value: MergePick) => void;
}) {
  // Nothing to choose between when both guests have the same value.
  if ((keepValue ?? "") === (mergeValue ?? "")) return null;

  const options: [MergePick, string | null][] = [
    ["keep", keepValue],
    ["merge", mergeValue],
  ];

  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      {options.map(([choice, text]) => (
        <label key={choice} className="flex items-center gap-2 text-sm text-foreground">
          <input type="radio" name={`${field}-pick`} checked={value === choice} onChange={() => onPick(choice)} />
          {text ? (
            <bdi dir={field === "phone" ? "ltr" : undefined}>{text}</bdi>
          ) : (
            <span className="text-muted-foreground">فارغ</span>
          )}
        </label>
      ))}
    </fieldset>
  );
}

/** "Merge these two": a button that opens a confirm step before anything changes. */
export default function MergePanel({
  eventId,
  first,
  second,
  label,
}: {
  eventId: number;
  first: CleanupGuest;
  second: CleanupGuest;
  label: string;
}) {
  const vm = useMergeGuestsViewModel(first, second);

  if (!vm.open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={vm.openPanel}>
        {label}
      </Button>
    );
  }

  return (
    <form action={vm.action} className="mt-3 w-full space-y-4 rounded-lg border border-border p-4">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="keepId" value={vm.keep.id} />
      <input type="hidden" name="mergeId" value={vm.merge.id} />
      <input type="hidden" name="phone" value={vm.picks.phone} />
      <input type="hidden" name="note" value={vm.picks.note} />

      <div className="flex flex-wrap items-center gap-3">
        <GuestSummary role="تبقى" guest={vm.keep} />
        <Button type="button" variant="ghost" size="sm" onClick={vm.swap} disabled={vm.pending}>
          ⇄ تبديل
        </Button>
        <GuestSummary role="تُدمج ثم تُحذف" guest={vm.merge} />
      </div>

      <PickField
        label="الهاتف"
        field="phone"
        keepValue={vm.keep.phone}
        mergeValue={vm.merge.phone}
        value={vm.picks.phone}
        onPick={(value) => vm.pick("phone", value)}
      />
      <PickField
        label="الملاحظة"
        field="note"
        keepValue={vm.keep.note}
        mergeValue={vm.merge.note}
        value={vm.picks.note}
        onPick={(value) => vm.pick("note", value)}
      />

      <p className="text-sm text-muted-foreground">
        تنتقل كل سجلات الدخول والخروج من «{vm.merge.name}» إلى «{vm.keep.name}»، ثم تُحذف الدعوة المدمجة. لا يمكن التراجع.
      </p>

      {vm.error ? <ErrorNote>{vm.error}</ErrorNote> : null}
      {vm.ok ? <p className="text-sm text-good-ink">{vm.ok}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" variant="destructive" isLoading={vm.pending}>
          {vm.pending ? "جارٍ الدمج…" : "تأكيد الدمج"}
        </Button>
        <Button type="button" variant="outline" onClick={vm.closePanel} disabled={vm.pending}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
