"use client";

import { ErrorNote } from "@/shared/component/error-note";
import { Field } from "@/shared/component/field";
import { Button } from "@/shared/component/ui/button";
import { Card, CardContent } from "@/shared/component/ui/card";
import { Input } from "@/shared/component/ui/input";
import { useSetupFormViewModel } from "../view-model/useSetupFormViewModel";

export default function SetupForm() {
  const { error, action, pending } = useSetupFormViewModel();

  return (
    <form action={action}>
      <Card>
        <CardContent className="space-y-4">
          <Field label="البريد الإلكتروني" htmlFor="email" hint="ستستخدمه لتسجيل الدخول.">
            <Input id="email" name="email" type="email" placeholder="you@example.com" required autoFocus dir="ltr" />
          </Field>

          <Field label="كلمة المرور" htmlFor="password" hint="8 أحرف على الأقل.">
            <Input id="password" name="password" type="password" minLength={8} required dir="ltr" />
          </Field>

          {error ? <ErrorNote>{error}</ErrorNote> : null}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "جارٍ الإنشاء…" : "إنشاء الحساب"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
