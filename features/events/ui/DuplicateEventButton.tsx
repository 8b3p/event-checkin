"use client";

import { SubmitButton } from "@/shared/component/submit-button";
import { duplicateEventAction } from "@/app/events/actions";

export default function DuplicateEventButton({ eventId }: { eventId: number }) {
  return (
    <form action={duplicateEventAction}>
      <input type="hidden" name="id" value={eventId} />
      <SubmitButton variant="outline" className="w-full">
        نسخ هذه الفعالية
      </SubmitButton>
    </form>
  );
}
