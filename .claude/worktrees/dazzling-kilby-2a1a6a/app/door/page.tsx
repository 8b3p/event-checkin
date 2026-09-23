import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import DoorForm from "./door-form";

export const dynamic = "force-dynamic";

export default async function DoorPage() {
  const settings = getSettings();
  if (!settings) redirect("/setup");
  if (await getSession()) redirect("/scan");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center bg-night px-5 py-12">
      <div className="mb-8 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-night-muted">Door</p>
        <h1 className="display mt-2 text-4xl text-night-ink">{settings.couple_names}</h1>
        <p className="mt-2 text-sm text-night-muted">Enter the door code to start scanning.</p>
      </div>

      <DoorForm />
    </main>
  );
}
