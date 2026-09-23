import type { Event } from "../Event";
import type { IEventRepository } from "../IEventRepository";
import { CreateEventUseCase } from "./CreateEventUseCase";

/** Clones an event's settings, not its guests, with a fresh door code and no date — spec §6. */
export class DuplicateEventUseCase {
  constructor(private readonly eventRepository: IEventRepository) {}

  async execute(id: number, newDoorCode: string): Promise<Event> {
    const source = await this.eventRepository.getById(id);
    if (!source) throw new Error("لم يتم العثور على الفعالية.");

    return new CreateEventUseCase(this.eventRepository).execute({
      name: source.name,
      eventDate: null,
      venue: source.venue,
      description: source.description,
      doorCode: newDoorCode,
      capacity: source.capacity,
    });
  }
}
