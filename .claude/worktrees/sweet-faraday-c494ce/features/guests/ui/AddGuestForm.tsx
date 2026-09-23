"use client";

import { ErrorNote } from "@/shared/component/error-note";
import { Field } from "@/shared/component/field";
import { Button } from "@/shared/component/ui/button";
import { Card, CardContent } from "@/shared/component/ui/card";
import { Input } from "@/shared/component/ui/input";
import { useAddGuestFormViewModel } from "../view-model/useAddGuestFormViewModel";

export default function AddGuestForm({ eventId, onDone }: { eventId: number; onDone: () => void }) {
  const { error, ok, action, pending } = useAddGuestFormViewModel();

  return (
    <Card>
      <CardContent className="space-y-4">
        <form action={action} className="space-y-4">
          <input type="hidden" name="eventId" value={eventId} />

          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field label="الاسم" htmlFor="name">
              <Input id="name" name="name" placeholder="عائلة آل فلان" required autoFocus />
            </Field>
            <Field label="عدد المقاعد" htmlFor="seats">
              <Input id="seats" name="seats" type="number" min={1} max={50} defaultValue={1} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الهاتف" htmlFor="phone" hint="اختياري — يفيد عند إرسال الدعوة.">
              <Input id="phone" name="phone" placeholder="+971 ..." dir="ltr" />
            </Field>
            <Field label="ملاحظة" htmlFor="note" hint="اختياري.">
              <Input id="note" name="note" placeholder="جهة العروس" />
            </Field>
          </div>

          {error ? <ErrorNote>{error}</ErrorNote> : null}
          {ok ? <p className="text-sm text-good-ink">{ok}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "جارٍ الإضافة…" : "إضافة"}
            </Button>
            <Button type="button" variant="ghost" onClick={onDone}>
              تم
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
