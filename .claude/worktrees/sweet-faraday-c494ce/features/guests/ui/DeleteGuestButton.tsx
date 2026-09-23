"use client";

import { useState } from "react";
import { Button } from "@/shared/component/ui/button";
import { deleteGuestAction } from "@/app/events/[id]/guests/[guestId]/actions";

export default function DeleteGuestButton({ eventId, guestId }: { eventId: number; guestId: number }) {
  const [confirming, setConfirming] = useState(false);

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
    <form action={deleteGuestAction} className="flex gap-2">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="id" value={guestId} />
      <Button type="submit" variant="destructive" className="flex-1">
        تأكيد الحذف
      </Button>
      <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirming(false)}>
        إلغاء
      </Button>
    </form>
  );
}
