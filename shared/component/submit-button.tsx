"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/shared/component/ui/button";

/** A submit button for a plain `<form action={serverAction}>` with no
 * `useActionState` view-model wrapping it — reads pending state from the
 * surrounding form via `useFormStatus`, since `Button` itself has no way
 * to know it's inside a pending form submission otherwise. */
export function SubmitButton({
  children,
  disabled,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" {...props} isLoading={pending} disabled={disabled || pending}>
      {children}
    </Button>
  );
}
