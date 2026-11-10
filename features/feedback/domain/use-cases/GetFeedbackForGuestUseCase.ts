import type { GuestFeedback } from "../Feedback";
import type { IFeedbackRepository } from "../IFeedbackRepository";

export class GetFeedbackForGuestUseCase {
  constructor(private readonly feedbackRepository: IFeedbackRepository) {}

  execute(guestId: number): Promise<GuestFeedback | null> {
    return this.feedbackRepository.getForGuest(guestId);
  }
}
