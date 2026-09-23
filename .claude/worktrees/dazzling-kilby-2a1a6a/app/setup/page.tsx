import { redirect } from "next/navigation";
import { CheckSetupStatusUseCase } from "@/features/auth/domain/use-cases/CheckSetupStatusUseCase";
import { makeOwnerRepository } from "@/features/auth/infrastructure/factory";
import SetupForm from "@/features/auth/ui/SetupForm";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const isSetUp = await new CheckSetupStatusUseCase(makeOwnerRepository()).execute();
  if (isSetUp) redirect("/login");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-12">
      <div className="mb-8 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">التشغيل الأول</p>
        <h1 className="display mt-2 text-4xl text-foreground">مرحباً بك في الباب</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">
          أنشئ حسابك الآن، ثم أضف فعالياتك من لوحة التحكم.
        </p>
      </div>
      <SetupForm />
    </main>
  );
}
