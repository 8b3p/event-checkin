import type { IEventRepository } from "@/features/events/domain/IEventRepository";
import type { Session } from "../Session";

export type DoorAuthResult =
  | { outcome: "ok"; session: Session }
  | { outcome: "invalid_code" }
  /** The code is right but the event has ended — archiving locks the door. */
  | { outcome: "archived" };

/**
 * Cross-feature domain dependency, through the events feature's repository
 * interface — not its implementation. See 04-NEXTJS-ADAPTATION.md.
 */
export class AuthenticateDoorUseCase {
  constructor(private readonly eventRepository: IEventRepository) {}

  async execute(doorCode: string): Promise<DoorAuthResult> {
    const event = await this.eventRepository.getByDoorCode(doorCode.trim().toUpperCase());
    if (!event) return { outcome: "invalid_code" };
    if (event.status === "archived") return { outcome: "archived" };
    return { outcome: "ok", session: { role: "door", eventId: event.id } };
  }
}
