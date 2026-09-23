"use client";

import { useActionState } from "react";
import { updateGuestAction, type EditGuestFormState } from "@/app/events/[id]/guests/[guestId]/actions";

export function useEditGuestFormViewModel() {
  const [state, action, pending] = useActionState<EditGuestFormState, FormData>(updateGuestAction, {});
  return { error: state.error, ok: state.ok, action, pending };
}
