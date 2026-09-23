import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckSetupStatusUseCase } from "@/features/auth/domain/use-cases/CheckSetupStatusUseCase";
import { makeOwnerRepository } from "@/features/auth/infrastructure/factory";
import { getSession } from "@/shared/lib/session-cookie";
import LoginForm from "@/features/auth/ui/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const isSetUp = await new CheckSetupStatusUseCase(makeOwnerRepository()).execute();
  if (!isSetUp) redirect("/setup");
  if ((await getSession())?.role === "owner") redirect("/");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-12">
      <div className="mb-8 text-center">
        <h1 className="display text-4xl text-foreground">أهلاً بعودتك</h1>
        <p className="mt-2 text-sm text-muted-foreground">سجّل الدخول لإدارة فعالياتك.</p>
      </div>

      <LoginForm />

      <p className="mt-5 text-center text-xs text-muted-foreground">
        <Link href="/door" className="underline underline-offset-4 hover:text-foreground">
          فريق الاستقبال؟ ادخل برمز الباب
        </Link>
      </p>
    </main>
  );
}
