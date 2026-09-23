import type { IEventRepository } from "@/features/events/domain/IEventRepository";
import type { Session } from "../Session";

/**
 * Cross-feature domain dependency, through the events feature's repository
 * interface — not its implementation. See 04-NEXTJS-ADAPTATION.md.
 */
export class AuthenticateDoorUseCase {
  constructor(private readonly eventRepository: IEventRepository) {}

  async execute(doorCode: string): Promise<Session | null> {
    const event = await this.eventRepository.getByDoorCode(doorCode.trim().toUpperCase());
    return event ? { role: "door", eventId: event.id } : null;
  }
}
