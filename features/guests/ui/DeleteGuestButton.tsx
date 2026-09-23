"use client";

import { useState } from "react";
import { ErrorNote } from "@/shared/component/error-note";
import { Button } from "@/shared/component/ui/button";
import { useDeleteGuestActionViewModel } from "../view-model/useDeleteGuestActionViewModel";

export default function DeleteGuestButton({ eventId, guestId }: { eventId: number; guestId: number }) {
  const [confirming, setConfirming] = useState(false);
  const { error, action, pending } = useDeleteGuestActionViewModel();

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="outline"
        className="border-destructive text-destructive hover:bg-destructive/10"
        onClick={() => setConfirming(true)}
      >
        حذف الدعوة
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <form action={action} className="flex gap-2">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="id" value={guestId} />
        <Button type="submit" variant="destructive" className="flex-1" disabled={pending}>
          {pending ? "جارٍ الحذف…" : "تأكيد الحذف"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => setConfirming(false)}
          disabled={pending}
        >
          إلغاء
        </Button>
      </form>
    </div>
  );
}
