"use server";

import { redirect } from "next/navigation";
import { AuthenticateDoorUseCase } from "@/features/auth/domain/use-cases/AuthenticateDoorUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { setSessionCookie } from "@/shared/lib/session-cookie";

export type DoorAuthState = { error?: string };

export async function doorLoginAction(_prev: DoorAuthState, formData: FormData): Promise<DoorAuthState> {
  const code = String(formData.get("doorCode") ?? "");

  const session = await new AuthenticateDoorUseCase(makeEventRepository()).execute(code);
  if (!session) {
    return { error: "رمز الباب غير صحيح." };
  }

  await setSessionCookie(session);
  redirect("/scan");
}
