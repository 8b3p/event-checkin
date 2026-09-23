"use server";

import { redirect } from "next/navigation";
import { AuthenticateOwnerUseCase } from "@/features/auth/domain/use-cases/AuthenticateOwnerUseCase";
import { makeOwnerRepository } from "@/features/auth/infrastructure/factory";
import { setSessionCookie } from "@/shared/lib/session-cookie";

export type AuthState = { error?: string };

export async function ownerLoginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const session = await new AuthenticateOwnerUseCase(makeOwnerRepository()).execute(email, password);
  if (!session) {
    return { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." };
  }

  await setSessionCookie(session);
  redirect("/");
}
