import type { IEventRepository } from "../IEventRepository";

export class ArchiveEventUseCase {
  constructor(private readonly eventRepository: IEventRepository) {}

  execute(id: number): Promise<void> {
    return this.eventRepository.archive(id);
  }
}
