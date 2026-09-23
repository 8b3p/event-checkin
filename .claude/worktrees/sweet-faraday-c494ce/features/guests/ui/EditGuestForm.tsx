"use client";

import { ErrorNote } from "@/shared/component/error-note";
import { Field } from "@/shared/component/field";
import { Button } from "@/shared/component/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/component/ui/card";
import { Input } from "@/shared/component/ui/input";
import type { Guest } from "../domain/Guest";
import { useEditGuestFormViewModel } from "../view-model/useEditGuestFormViewModel";

export default function EditGuestForm({ eventId, guest }: { eventId: number; guest: Guest }) {
  const { error, ok, action, pending } = useEditGuestFormViewModel();

  return (
    <Card>
      <CardHeader>
        <CardTitle>التفاصيل</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="id" value={guest.id} />

          <div className="grid gap-4 sm:grid-cols-[1fr_110px]">
            <Field label="الاسم" htmlFor="name">
              <Input id="name" name="name" defaultValue={guest.name} required />
            </Field>
            <Field label="المقاعد" htmlFor="seats">
              <Input id="seats" name="seats" type="number" min={1} max={50} defaultValue={guest.seats} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الهاتف" htmlFor="phone">
              <Input id="phone" name="phone" defaultValue={guest.phone ?? ""} placeholder="+971 ..." dir="ltr" />
            </Field>
            <Field label="ملاحظة" htmlFor="note">
              <Input id="note" name="note" defaultValue={guest.note ?? ""} placeholder="جهة العروس" />
            </Field>
          </div>

          {error ? <ErrorNote>{error}</ErrorNote> : null}
          {ok ? <p className="text-sm text-good-ink">{ok}</p> : null}

          <Button type="submit" disabled={pending}>
            {pending ? "جارٍ الحفظ…" : "حفظ التغييرات"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
