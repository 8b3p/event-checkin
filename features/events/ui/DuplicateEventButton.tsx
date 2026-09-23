"use client";

import { Button } from "@/shared/component/ui/button";
import { duplicateEventAction } from "@/app/events/actions";

export default function DuplicateEventButton({ eventId }: { eventId: number }) {
  return (
    <form action={duplicateEventAction}>
      <input type="hidden" name="id" value={eventId} />
      <Button type="submit" variant="outline" className="w-full">
        نسخ هذه الفعالية
      </Button>
    </form>
  );
}
