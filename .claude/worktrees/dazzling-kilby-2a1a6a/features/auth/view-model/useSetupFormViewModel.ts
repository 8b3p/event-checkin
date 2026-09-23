"use client";

import { useActionState } from "react";
import { setupAction, type SetupState } from "@/app/setup/actions";

export function useSetupFormViewModel() {
  const [state, action, pending] = useActionState<SetupState, FormData>(setupAction, {});
  return { error: state.error, action, pending };
}
