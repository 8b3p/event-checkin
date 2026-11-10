import type { IEventRepository } from "@/features/events/domain/IEventRepository";
import type { IGuestRepository } from "@/features/guests/domain/IGuestRepository";
import { MAX_COMMENT_LENGTH, MAX_RATING, MIN_RATING } from "../Feedback";
import type { IFeedbackRepository } from "../IFeedbackRepository";
import { isEventOver } from "../isEventOver";

export type SubmitFeedbackInput = {
  /** The guest's invite code — the secret that authorises this submission. */
  code: string;
  rating: unknown;
  comment: unknown;
};

export type SubmitFeedbackResult =
  | { ok: true; rating: number; comment: string | null }
  | { ok: false; reason: "not_found" | "not_open" | "invalid_rating" | "comment_too_long" };

export class SubmitFeedbackUseCase {
  constructor(
    private readonly feedbackRepository: IFeedbackRepository,
    private readonly guestRepository: IGuestRepository,
    private readonly eventRepository: IEventRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: SubmitFeedbackInput): Promise<SubmitFeedbackResult> {
    const guest = await this.guestRepository.getByCode(input.code);
    if (!guest) return { ok: false, reason: "not_found" };

    const event = await this.eventRepository.getById(guest.eventId);
    if (!event) return { ok: false, reason: "not_found" };
    if (!isEventOver(event, this.now())) return { ok: false, reason: "not_open" };

    // A form field arrives as a string; anything but a plain integer in range is rejected.
    const rating = typeof input.rating === "string" && /^\d+$/.test(input.rating) ? Number(input.rating) : input.rating;
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
      return { ok: false, reason: "invalid_rating" };
    }

    const comment = typeof input.comment === "string" ? input.comment.trim() : "";
    if (comment.length > MAX_COMMENT_LENGTH) return { ok: false, reason: "comment_too_long" };

    const saved = await this.feedbackRepository.upsert({ guestId: guest.id, rating, comment: comment || null });
    return { ok: true, rating: saved.rating, comment: saved.comment };
  }
}
