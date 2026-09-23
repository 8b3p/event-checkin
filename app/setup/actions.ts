"use server";

import { redirect } from "next/navigation";
import { CheckSetupStatusUseCase } from "@/features/auth/domain/use-cases/CheckSetupStatusUseCase";
import { CreateOwnerUseCase } from "@/features/auth/domain/use-cases/CreateOwnerUseCase";
import { makeOwnerRepository } from "@/features/auth/infrastructure/factory";
import { setSessionCookie } from "@/shared/lib/session-cookie";

export type SetupState = { error?: string };

export async function setupAction(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const ownerRepository = makeOwnerRepository();
  if (await new CheckSetupStatusUseCase(ownerRepository).execute()) redirect("/login");

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    await new CreateOwnerUseCase(ownerRepository).execute({ email, password });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "حدث خطأ غير متوقع." };
  }

  await setSessionCookie({ role: "owner" });
  redirect("/");
}
