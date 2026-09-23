"use client";

import { useActionState } from "react";
import { updateGuestAction, type GuestState } from "../actions";
import { Button, Card, CardHeader, ErrorNote, Field, Input } from "@/components/ui";
import type { GuestWithArrival } from "@/lib/db";

export default function EditGuest({ guest }: { guest: GuestWithArrival }) {
  const [state, action, pending] = useActionState<GuestState, FormData>(updateGuestAction, {});

  return (
    <Card>
      <CardHeader title="Details" hint="Changing these doesn't change their QR code." />
      <form action={action} className="space-y-4 p-5">
        <input type="hidden" name="id" value={guest.id} />

        <div className="grid gap-4 sm:grid-cols-[1fr_110px]">
          <Field label="Name">
            <Input name="name" defaultValue={guest.name} required />
          </Field>
          <Field label="Seats">
            <Input name="seats" type="number" min={1} max={50} defaultValue={guest.seats} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <Input name="phone" defaultValue={guest.phone ?? ""} placeholder="+971 ..." />
          </Field>
          <Field label="Note">
            <Input name="note" defaultValue={guest.note ?? ""} placeholder="Bride's side" />
          </Field>
        </div>

        {state.error ? <ErrorNote>{state.error}</ErrorNote> : null}
        {state.ok ? <p className="text-sm text-good">{state.ok}</p> : null}

        <Button tone="primary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </Card>
  );
}
