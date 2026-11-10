import type { MergeFieldPicks } from "./dataQuality";
import type { BulkGuestRow, CreateGuestInput, Guest, UpdateGuestInput } from "./Guest";

export type MergeGuestsResult = { movedScans: number };

export interface IGuestRepository {
  listForEvent(eventId: number): Promise<Guest[]>;
  getById(eventId: number, id: number): Promise<Guest | null>;
  getByCode(code: string): Promise<Guest | null>;
  create(input: CreateGuestInput): Promise<Guest>;
  createMany(eventId: number, rows: BulkGuestRow[]): Promise<number>;
  update(eventId: number, id: number, input: UpdateGuestInput): Promise<void>;
  delete(eventId: number, id: number): Promise<void>;
  /**
   * Merges guest `mergeId` into `keepId` in one transaction: every scan of
   * `mergeId` moves to `keepId`, the phone/note come from whichever guest
   * `picks` names, and `mergeId` is deleted. Throws if either guest isn't in
   * the event, in which case nothing changes.
   */
  mergeInto(eventId: number, keepId: number, mergeId: number, picks: MergeFieldPicks): Promise<MergeGuestsResult>;
}
