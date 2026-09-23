import type { Event, EventInput } from "../Event";
import type { IEventRepository } from "../IEventRepository";

export class CreateEventUseCase {
  constructor(private readonly eventRepository: IEventRepository) {}

  async execute(input: EventInput): Promise<Event> {
    const name = input.name.trim();
    const doorCode = input.doorCode.trim().toUpperCase();

    if (!name) throw new Error("أضف اسماً للفعالية.");
    if (doorCode.length < 4) throw new Error("يجب أن يتكون رمز الباب من 4 أحرف على الأقل.");

    const existing = await this.eventRepository.getByDoorCode(doorCode);
    if (existing) throw new Error("رمز الباب مستخدم بالفعل. اختر رمزاً آخر.");

    return this.eventRepository.create({ ...input, name, doorCode });
  }
}
