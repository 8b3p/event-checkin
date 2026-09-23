"use client";

import { useActionState } from "react";
import { updateEventAction, type EventFormState } from "@/app/events/actions";

export function useEventSettingsFormViewModel() {
  const [state, action, pending] = useActionState<EventFormState, FormData>(updateEventAction, {});
  return { error: state.error, ok: state.ok, action, pending };
}
