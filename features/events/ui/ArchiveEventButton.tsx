"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/shared/component/ui/button";
import { SubmitButton } from "@/shared/component/submit-button";
import { archiveEventAction } from "@/app/events/actions";

export default function ArchiveEventButton({ eventId }: { eventId: number }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="outline"
        className="w-full border-destructive text-destructive hover:bg-destructive/10"
        onClick={() => setConfirming(true)}
      >
        أرشفة هذه الفعالية
      </Button>
    );
  }

  return (
    <form action={archiveEventAction} className="flex gap-2">
      <input type="hidden" name="id" value={eventId} />
      <ConfirmButtons onCancel={() => setConfirming(false)} />
    </form>
  );
}

/** Reads pending state from the surrounding form via `useFormStatus` so
 * the cancel button can be disabled too — this is a plain form action
 * with no `useActionState` view-model exposing `pending` directly. */
function ConfirmButtons({ onCancel }: { onCancel: () => void }) {
  const { pending } = useFormStatus();
  return (
    <>
      <SubmitButton variant="destructive" className="flex-1">
        تأكيد الأرشفة
      </SubmitButton>
      <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={pending}>
        إلغاء
      </Button>
    </>
  );
}
