import { Shell, PageHeading } from "@/shared/component/Shell";
import { generateDoorCode } from "@/shared/lib/codes";
import { requireOwner } from "@/shared/lib/guard";
import CreateEventForm from "@/features/events/ui/CreateEventForm";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  await requireOwner();

  return (
    <Shell>
      <PageHeading title="فعالية جديدة" />
      <CreateEventForm suggestedDoorCode={generateDoorCode()} />
    </Shell>
  );
}
