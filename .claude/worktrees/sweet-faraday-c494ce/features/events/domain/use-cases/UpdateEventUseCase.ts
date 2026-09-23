import type { EventInput } from "../Event";
import type { IEventRepository } from "../IEventRepository";

export class UpdateEventUseCase {
  constructor(private readonly eventRepository: IEventRepository) {}

  async execute(id: number, input: EventInput): Promise<void> {
    const name = input.name.trim();
    const doorCode = input.doorCode.trim().toUpperCase();

    if (!name) throw new Error("أضف اسماً للفعالية.");
    if (doorCode.length < 4) throw new Error("يجب أن يتكون رمز الباب من 4 أحرف على الأقل.");

    const existing = await this.eventRepository.getByDoorCode(doorCode);
    if (existing && existing.id !== id) throw new Error("رمز الباب مستخدم بالفعل. اختر رمزاً آخر.");

    return this.eventRepository.update(id, { ...input, name, doorCode });
  }
}
