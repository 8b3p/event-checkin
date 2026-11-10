"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/shared/component/ui/button";
import { SubmitButton } from "@/shared/component/submit-button";
import { restoreEventAction } from "@/app/events/actions";

export default function RestoreEventButton({ eventId }: { eventId: number }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button type="button" variant="outline" className="w-full" onClick={() => setConfirming(true)}>
        استعادة الفعالية
      </Button>
    );
  }

  return (
    <form action={restoreEventAction} className="flex gap-2">
      <input type="hidden" name="id" value={eventId} />
      <ConfirmButtons onCancel={() => setConfirming(false)} />
    </form>
  );
}

/** See `ArchiveEventButton` — pending state comes from the surrounding form. */
function ConfirmButtons({ onCancel }: { onCancel: () => void }) {
  const { pending } = useFormStatus();
  return (
    <>
      <SubmitButton className="flex-1">تأكيد الاستعادة</SubmitButton>
      <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={pending}>
        إلغاء
      </Button>
    </>
  );
}
