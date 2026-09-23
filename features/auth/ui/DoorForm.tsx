"use client";

import { ErrorNote } from "@/shared/component/error-note";
import { Field } from "@/shared/component/field";
import { Button } from "@/shared/component/ui/button";
import { Card, CardContent } from "@/shared/component/ui/card";
import { Input } from "@/shared/component/ui/input";
import { useDoorFormViewModel } from "../view-model/useDoorFormViewModel";

export default function DoorForm() {
  const { error, action, pending } = useDoorFormViewModel();

  return (
    <form action={action}>
      <Card>
        <CardContent className="space-y-4">
          <Field label="رمز الباب" htmlFor="doorCode">
            <Input
              id="doorCode"
              name="doorCode"
              required
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              dir="ltr"
              className="text-center text-lg tracking-[0.3em] uppercase"
            />
          </Field>

          {error ? <ErrorNote>{error}</ErrorNote> : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "جارٍ الدخول…" : "دخول"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
