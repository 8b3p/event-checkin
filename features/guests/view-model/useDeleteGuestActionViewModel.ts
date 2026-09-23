"use client";

import { useActionState } from "react";
import { deleteGuestAction, type DeleteGuestFormState } from "@/app/events/[id]/guests/[guestId]/actions";

export function useDeleteGuestActionViewModel() {
  const [state, action, pending] = useActionState<DeleteGuestFormState, FormData>(deleteGuestAction, {});
  return { error: state.error, action, pending };
}
