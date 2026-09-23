import { getStats, getSettings } from "@/lib/db";
import { requireDoor } from "@/lib/guard";
import Scanner from "./scanner";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  await requireDoor();

  const settings = getSettings()!;
  const stats = getStats();

  return <Scanner coupleNames={settings.couple_names} initialStats={stats} />;
}
