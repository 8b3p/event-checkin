"use client";

import { useActionState } from "react";
import { createEventAction, type EventFormState } from "@/app/events/actions";

export function useCreateEventFormViewModel() {
  const [state, action, pending] = useActionState<EventFormState, FormData>(createEventAction, {});
  return { error: state.error, action, pending };
}
