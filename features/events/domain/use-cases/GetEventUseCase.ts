import type { Event } from "../Event";
import type { IEventRepository } from "../IEventRepository";

export class GetEventUseCase {
  constructor(private readonly eventRepository: IEventRepository) {}

  execute(id: number): Promise<Event | null> {
    return this.eventRepository.getById(id);
  }
}
