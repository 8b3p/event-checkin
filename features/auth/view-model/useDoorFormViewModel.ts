"use client";

import { useActionState } from "react";
import { doorLoginAction, type DoorAuthState } from "@/app/door-actions";

export function useDoorFormViewModel() {
  const [state, action, pending] = useActionState<DoorAuthState, FormData>(doorLoginAction, {});
  return { error: state.error, action, pending };
}
