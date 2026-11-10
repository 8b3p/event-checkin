import { redirect } from "next/navigation";
import { makeOwnerRepository } from "@/features/auth/infrastructure/factory";
import { CheckSetupStatusUseCase } from "@/features/auth/domain/use-cases/CheckSetupStatusUseCase";
import { GetEventUseCase } from "@/features/events/domain/use-cases/GetEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { getSession } from "./session-cookie";

/**
 * Page-level guards. Every protected page and every mutating server action
 * calls one of these — there is no middleware doing it invisibly somewhere
 * else.
 */

export async function requireSetUp(): Promise<void> {
  const isSetUp = await new CheckSetupStatusUseCase(makeOwnerRepository()).execute();
  if (!isSetUp) redirect("/setup");
}

export async function requireOwner(): Promise<void> {
  await requireSetUp();
  const session = await getSession();
  if (!session || session.role !== "owner") redirect("/login");
}

/** Archiving an event locks its door: new logins are refused and sessions
 * already open stop working. A door session's cookie outlives the archive, so
 * the event is looked up on every guarded call rather than trusted from the
 * cookie. */
export async function isEventOpenForDoor(eventId: number): Promise<boolean> {
  const event = await new GetEventUseCase(makeEventRepository()).execute(eventId);
  return event !== null && event.status !== "archived";
}

/** Returns the event id the current door session is scoped to. */
export async function requireDoor(): Promise<number> {
  await requireSetUp();
  const session = await getSession();
  if (!session || session.role !== "door") redirect("/door");
  if (!(await isEventOpenForDoor(session.eventId))) redirect("/door");
  return session.eventId;
}
