import { redirect } from "next/navigation";
import { CheckSetupStatusUseCase } from "@/features/auth/domain/use-cases/CheckSetupStatusUseCase";
import { makeOwnerRepository } from "@/features/auth/infrastructure/factory";
import { isEventOpenForDoor } from "@/shared/lib/guard";
import { getSession } from "@/shared/lib/session-cookie";
import DoorForm from "@/features/auth/ui/DoorForm";

export const dynamic = "force-dynamic";

export default async function DoorPage() {
  const isSetUp = await new CheckSetupStatusUseCase(makeOwnerRepository()).execute();
  if (!isSetUp) redirect("/setup");
  // Only a door session whose event is still open skips the form — one left
  // over from an archived event would otherwise bounce /scan <-> /door forever.
  const session = await getSession();
  if (session?.role === "door" && (await isEventOpenForDoor(session.eventId))) redirect("/scan");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-12">
      <div className="mb-8 text-center">
        <h1 className="display text-4xl text-foreground">بوابة الاستقبال</h1>
        <p className="mt-2 text-sm text-muted-foreground">أدخل رمز الباب الخاص بفعاليتك.</p>
      </div>

      <DoorForm />
    </main>
  );
}
