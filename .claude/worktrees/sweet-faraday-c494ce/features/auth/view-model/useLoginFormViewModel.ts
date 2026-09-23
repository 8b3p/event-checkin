"use client";

import { useActionState } from "react";
import { ownerLoginAction, type AuthState } from "@/app/auth-actions";

export function useLoginFormViewModel() {
  const [state, action, pending] = useActionState<AuthState, FormData>(ownerLoginAction, {});
  return { error: state.error, action, pending };
}
