import { redirect } from "next/navigation";
import { makeOwnerRepository } from "@/features/auth/infrastructure/factory";
import { CheckSetupStatusUseCase } from "@/features/auth/domain/use-cases/CheckSetupStatusUseCase";
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

/** Returns the event id the current door session is scoped to. */
export async function requireDoor(): Promise<number> {
  await requireSetUp();
  const session = await getSession();
  if (!session || session.role !== "door") redirect("/door");
  return session.eventId;
}
