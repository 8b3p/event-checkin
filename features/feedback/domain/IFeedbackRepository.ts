import type { EventFeedbackItem, GuestFeedback, SaveFeedbackInput } from "./Feedback";

export interface IFeedbackRepository {
  /** Insert, or overwrite the guest's existing answer (one row per guest). */
  upsert(input: SaveFeedbackInput): Promise<GuestFeedback>;
  getForGuest(guestId: number): Promise<GuestFeedback | null>;
  /** Newest answer first. */
  listForEvent(eventId: number): Promise<EventFeedbackItem[]>;
}
