"use client";

import { ErrorNote } from "@/shared/component/error-note";
import { Field } from "@/shared/component/field";
import { Button } from "@/shared/component/ui/button";
import { Card, CardContent } from "@/shared/component/ui/card";
import { Input } from "@/shared/component/ui/input";
import { useLoginFormViewModel } from "../view-model/useLoginFormViewModel";

export default function LoginForm() {
  const { error, action, pending } = useLoginFormViewModel();

  return (
    <form action={action}>
      <Card>
        <CardContent className="space-y-4">
          <Field label="البريد الإلكتروني" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="username" required autoFocus dir="ltr" />
          </Field>
          <Field label="كلمة المرور" htmlFor="password">
            <Input id="password" name="password" type="password" autoComplete="current-password" required dir="ltr" />
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
