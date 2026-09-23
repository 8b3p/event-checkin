"use client";

import { useActionState } from "react";
import { addWalkInAction, type WalkInFormState } from "@/app/scan/actions";

export function useAddWalkInFormViewModel() {
  const [state, action, pending] = useActionState<WalkInFormState, FormData>(addWalkInAction, {});
  return { error: state.error, guest: state.guest, action, pending };
}
