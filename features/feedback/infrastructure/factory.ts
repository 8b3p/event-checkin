import type { IFeedbackRepository } from "../domain/IFeedbackRepository";
import { FeedbackRepository } from "./FeedbackRepository";

export function makeFeedbackRepository(): IFeedbackRepository {
  return new FeedbackRepository();
}
