import type { Event } from "../Event";
import type { IEventRepository } from "../IEventRepository";

export class ListEventsUseCase {
  constructor(private readonly eventRepository: IEventRepository) {}

  execute(): Promise<Event[]> {
    return this.eventRepository.list();
  }
}
