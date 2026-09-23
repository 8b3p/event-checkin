"use client";

import { Button } from "@/components/ui";

export default function DeleteGuest({
  id,
  name,
  action,
}: {
  id: number;
  name: string;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`Delete ${name} and their arrival history? This can't be undone.`)) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" tone="danger">
        Delete {name}
      </Button>
    </form>
  );
}
