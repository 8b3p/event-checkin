import type { EventFeedbackItem } from "../Feedback";
import type { IFeedbackRepository } from "../IFeedbackRepository";

export class ListFeedbackForEventUseCase {
  constructor(private readonly feedbackRepository: IFeedbackRepository) {}

  execute(eventId: number): Promise<EventFeedbackItem[]> {
    return this.feedbackRepository.listForEvent(eventId);
  }
}
