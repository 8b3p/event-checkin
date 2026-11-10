import { MAX_RATING, MIN_RATING } from "./Feedback";

export type FeedbackSummary = {
  count: number;
  /** Mean rating rounded to one decimal; null when there are no ratings. */
  average: number | null;
  /** How many guests gave each rating, keyed 1..5 (always all five keys). */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
};

export function summarizeFeedback(items: readonly { rating: number }[]): FeedbackSummary {
  const distribution: FeedbackSummary["distribution"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let count = 0;
  let total = 0;

  for (const { rating } of items) {
    if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) continue;
    distribution[rating as keyof typeof distribution] += 1;
    count += 1;
    total += rating;
  }

  return { count, average: count === 0 ? null : Math.round((total / count) * 10) / 10, distribution };
}
