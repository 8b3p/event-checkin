"use client";

import { ErrorNote } from "@/shared/component/error-note";
import { Field } from "@/shared/component/field";
import { Button } from "@/shared/component/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/component/ui/card";
import { Input } from "@/shared/component/ui/input";
import { Textarea } from "@/shared/component/ui/textarea";
import type { Event } from "../domain/Event";
import { useEventSettingsFormViewModel } from "../view-model/useEventSettingsFormViewModel";

export default function EventSettingsForm({ event }: { event: Event }) {
  const { error, ok, action, pending } = useEventSettingsFormViewModel();

  return (
    <Card>
      <CardHeader>
        <CardTitle>تفاصيل الفعالية</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={event.id} />

          <Field label="اسم الفعالية" htmlFor="name">
            <Input id="name" name="name" defaultValue={event.name} required />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="التاريخ" htmlFor="eventDate">
              <Input id="eventDate" name="eventDate" type="date" defaultValue={event.eventDate ?? ""} />
            </Field>
            <Field label="المكان" htmlFor="venue">
              <Input id="venue" name="venue" defaultValue={event.venue ?? ""} />
            </Field>
          </div>

          <Field label="الوصف" htmlFor="description" hint="اختياري.">
            <Textarea id="description" name="description" rows={3} defaultValue={event.description ?? ""} />
          </Field>

          <Field label="رمز الباب" htmlFor="doorCode" hint="شاركه مع فريق الاستقبال.">
            <Input
              id="doorCode"
              name="doorCode"
              defaultValue={event.doorCode}
              minLength={4}
              required
              dir="ltr"
              className="tabular uppercase"
            />
          </Field>

          <Field label="السعة القصوى" htmlFor="capacity" hint="اختياري.">
            <Input
              id="capacity"
              name="capacity"
              type="number"
              min={1}
              inputMode="numeric"
              defaultValue={event.capacity ?? ""}
            />
          </Field>

          {error ? <ErrorNote>{error}</ErrorNote> : null}
          {ok ? <p className="text-sm text-good-ink">{ok}</p> : null}

          <Button type="submit" disabled={pending}>
            {pending ? "جارٍ الحفظ…" : "حفظ"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
