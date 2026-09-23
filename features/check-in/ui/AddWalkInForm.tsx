"use client";

import { useEffect, useRef } from "react";
import { ErrorNote } from "@/shared/component/error-note";
import { Field } from "@/shared/component/field";
import { Button } from "@/shared/component/ui/button";
import { Card, CardContent } from "@/shared/component/ui/card";
import { Input } from "@/shared/component/ui/input";
import type { WalkInGuest } from "@/app/scan/actions";
import { useAddWalkInFormViewModel } from "../view-model/useAddWalkInFormViewModel";

export default function AddWalkInForm({ onAdded, onDone }: { onAdded: (guest: WalkInGuest) => void; onDone: () => void }) {
  const { error, guest, action, pending } = useAddWalkInFormViewModel();
  const lastGuestId = useRef<number | null>(null);

  useEffect(() => {
    if (guest && guest.id !== lastGuestId.current) {
      lastGuestId.current = guest.id;
      onAdded(guest);
      onDone();
    }
  }, [guest, onAdded, onDone]);

  return (
    <Card>
      <CardContent className="space-y-4">
        <form action={action} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field label="الاسم" htmlFor="wi-name">
              <Input id="wi-name" name="name" placeholder="اسم الضيف" required autoFocus />
            </Field>
            <Field label="عدد المقاعد" htmlFor="wi-seats">
              <Input id="wi-seats" name="seats" type="number" min={1} max={50} defaultValue={1} />
            </Field>
          </div>

          {error ? <ErrorNote>{error}</ErrorNote> : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "جارٍ الإضافة…" : "إضافة وتسجيل الدخول"}
            </Button>
            <Button type="button" variant="ghost" onClick={onDone}>
              إلغاء
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
