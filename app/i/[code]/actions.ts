"use server";

import { SubmitFeedbackUseCase } from "@/features/feedback/domain/use-cases/SubmitFeedbackUseCase";
import { makeFeedbackRepository } from "@/features/feedback/infrastructure/factory";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { makeGuestRepository } from "@/features/guests/infrastructure/factory";
import { MAX_COMMENT_LENGTH } from "@/features/feedback/domain/Feedback";
import { normaliseScan } from "@/shared/lib/codes";

export type FeedbackFormState = {
  error?: string;
  /** Set once the answer is stored; the form swaps to its thank-you state. */
  saved?: { rating: number; comment: string | null };
};

const GENERIC_ERROR = "تعذّر إرسال رأيك. حاول مرة أخرى.";

/**
 * Guest-facing, no login: the invite code is the secret that authorises it,
 * the same as the invite page itself. An unknown or malformed code gets the
 * generic error so the action can't be used to probe which codes exist.
 */
export async function submitFeedbackAction(_prev: FeedbackFormState, formData: FormData): Promise<FeedbackFormState> {
  const code = normaliseScan(String(formData.get("code") ?? ""));
  if (!code) return { error: GENERIC_ERROR };

  try {
    const result = await new SubmitFeedbackUseCase(
      makeFeedbackRepository(),
      makeGuestRepository(),
      makeEventRepository(),
    ).execute({ code, rating: formData.get("rating"), comment: formData.get("comment") });

    if (result.ok) return { saved: { rating: result.rating, comment: result.comment } };

    switch (result.reason) {
      case "invalid_rating":
        return { error: "اختر عدد النجوم أولاً." };
      case "comment_too_long":
        return { error: `التعليق طويل جداً — الحد الأقصى ${MAX_COMMENT_LENGTH} حرف.` };
      case "not_open":
        return { error: "باب الآراء لم يُفتح بعد." };
      default:
        return { error: GENERIC_ERROR };
    }
  } catch {
    return { error: GENERIC_ERROR };
  }
}
