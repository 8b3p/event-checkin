"use client";

import { useState } from "react";
import { Button } from "@/shared/component/ui/button";
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
      <Button type="submit" variant="destructive" className="flex-1">
        تأكيد الأرشفة
      </Button>
      <Button type="button" variant="outline" className="flex-1" onClick={() => setConfirming(false)}>
        إلغاء
      </Button>
    </form>
  );
}
