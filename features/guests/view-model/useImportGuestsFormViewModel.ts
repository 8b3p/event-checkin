"use client";

import { useActionState } from "react";
import { importGuestsAction, type GuestFormState } from "@/app/events/[id]/guests/actions";

export function useImportGuestsFormViewModel() {
  const [state, action, pending] = useActionState<GuestFormState, FormData>(importGuestsAction, {});
  return { error: state.error, ok: state.ok, action, pending };
}
