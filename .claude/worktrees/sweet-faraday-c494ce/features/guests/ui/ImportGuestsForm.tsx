"use client";

import { ErrorNote } from "@/shared/component/error-note";
import { Field } from "@/shared/component/field";
import { Button } from "@/shared/component/ui/button";
import { Card, CardContent } from "@/shared/component/ui/card";
import { Textarea } from "@/shared/component/ui/textarea";
import { useImportGuestsFormViewModel } from "../view-model/useImportGuestsFormViewModel";

export default function ImportGuestsForm({ eventId, onDone }: { eventId: number; onDone: () => void }) {
  const { error, ok, action, pending } = useImportGuestsFormViewModel();

  return (
    <Card>
      <CardContent className="space-y-4">
        <form action={action} className="space-y-4">
          <input type="hidden" name="eventId" value={eventId} />

          <Field
            label="قائمتك"
            htmlFor="bulk"
            hint="دعوة واحدة في كل سطر. أضف عدد المقاعد وملاحظة بعد فاصلة إن أردت."
          >
            <Textarea
              id="bulk"
              name="bulk"
              rows={8}
              autoFocus
              className="font-mono text-xs"
              dir="ltr"
              placeholder={"عائلة آل فلان، 4، جهة العروس\nسارة حسن، 2\nجون سميث"}
            />
          </Field>

          {error ? <ErrorNote>{error}</ErrorNote> : null}
          {ok ? <p className="text-sm text-good-ink">{ok}</p> : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "جارٍ الإضافة…" : "إضافة الجميع"}
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
