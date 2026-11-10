"use server";

import { redirect } from "next/navigation";
import { AuthenticateDoorUseCase } from "@/features/auth/domain/use-cases/AuthenticateDoorUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { setSessionCookie } from "@/shared/lib/session-cookie";

export type DoorAuthState = { error?: string };

export async function doorLoginAction(_prev: DoorAuthState, formData: FormData): Promise<DoorAuthState> {
  const code = String(formData.get("doorCode") ?? "");

  const result = await new AuthenticateDoorUseCase(makeEventRepository()).execute(code);
  if (result.outcome === "archived") {
    return { error: "انتهت هذه الفعالية وتمت أرشفتها، لذلك تم إغلاق الباب." };
  }
  if (result.outcome === "invalid_code") {
    return { error: "رمز الباب غير صحيح." };
  }

  await setSessionCookie(result.session);
  redirect("/scan");
}
