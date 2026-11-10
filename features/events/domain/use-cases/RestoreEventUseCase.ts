import type { IEventRepository } from "../IEventRepository";

/** Undoes `ArchiveEventUseCase` — the event goes back to `live`, so its door
 * code works again. */
export class RestoreEventUseCase {
  constructor(private readonly eventRepository: IEventRepository) {}

  execute(id: number): Promise<void> {
    return this.eventRepository.restore(id);
  }
}
