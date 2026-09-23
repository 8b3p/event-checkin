"use client";

import { useActionState } from "react";
import { addGuestAction, type GuestFormState } from "@/app/events/[id]/guests/actions";

export function useAddGuestFormViewModel() {
  const [state, action, pending] = useActionState<GuestFormState, FormData>(addGuestAction, {});
  return { error: state.error, ok: state.ok, action, pending };
}
