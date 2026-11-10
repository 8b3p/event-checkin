import type { MergeFieldPicks } from "../dataQuality";
import type { IGuestRepository, MergeGuestsResult } from "../IGuestRepository";

export type MergeGuestsInput = {
  eventId: number;
  /** The guest that survives. */
  keepId: number;
  /** The guest folded into `keepId` and then deleted. */
  mergeId: number;
  picks: MergeFieldPicks;
};

export class MergeGuestsUseCase {
  constructor(private readonly guestRepository: IGuestRepository) {}

  execute({ eventId, keepId, mergeId, picks }: MergeGuestsInput): Promise<MergeGuestsResult> {
    if (keepId === mergeId) throw new Error("اختر دعوتين مختلفتين للدمج.");
    return this.guestRepository.mergeInto(eventId, keepId, mergeId, picks);
  }
}
