"use client";

import { ErrorNote } from "@/shared/component/error-note";
import { Field } from "@/shared/component/field";
import { Button } from "@/shared/component/ui/button";
import { Card, CardContent } from "@/shared/component/ui/card";
import { Input } from "@/shared/component/ui/input";
import { Textarea } from "@/shared/component/ui/textarea";
import { useCreateEventFormViewModel } from "../view-model/useCreateEventFormViewModel";

export default function CreateEventForm({ suggestedDoorCode }: { suggestedDoorCode: string }) {
  const { error, action, pending } = useCreateEventFormViewModel();

  return (
    <form action={action}>
      <Card>
        <CardContent className="space-y-4">
          <Field label="اسم الفعالية" htmlFor="name">
            <Input id="name" name="name" placeholder="مثال: حفل زفاف ليلى وعمر" required autoFocus />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="التاريخ" htmlFor="eventDate">
              <Input id="eventDate" name="eventDate" type="date" />
            </Field>
            <Field label="المكان" htmlFor="venue">
              <Input id="venue" name="venue" placeholder="اسم القاعة" />
            </Field>
          </div>

          <Field label="الوصف" htmlFor="description" hint="اختياري.">
            <Textarea id="description" name="description" rows={3} />
          </Field>

          <Field label="رمز الباب" htmlFor="doorCode" hint="شاركه مع فريق الاستقبال عند بدء الفعالية.">
            <Input
              id="doorCode"
              name="doorCode"
              defaultValue={suggestedDoorCode}
              minLength={4}
              required
              dir="ltr"
              className="tabular uppercase"
            />
          </Field>

          <Field label="السعة القصوى" htmlFor="capacity" hint="اختياري.">
            <Input id="capacity" name="capacity" type="number" min={1} inputMode="numeric" />
          </Field>

          {error ? <ErrorNote>{error}</ErrorNote> : null}

          <Button type="submit" disabled={pending}>
            {pending ? "جارٍ الإنشاء…" : "إنشاء"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
