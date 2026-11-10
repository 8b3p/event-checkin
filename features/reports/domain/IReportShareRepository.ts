import type { ReportShare } from "./ReportShare";

export interface IReportShareRepository {
  /** Null when the event is not shared (or does not exist). */
  getByEventId(eventId: number): Promise<ReportShare | null>;
  /** The event a token belongs to; null for an unknown or revoked token. */
  getByToken(token: string): Promise<{ eventId: number; share: ReportShare } | null>;
  /**
   * Starts sharing with `token`, only if the event is not already shared, and
   * returns the share in force, so two quick clicks agree on one link.
   * Null when the event does not exist.
   */
  create(eventId: number, token: string): Promise<ReportShare | null>;
  setShowNames(eventId: number, showNames: boolean): Promise<void>;
  /** Clears the token: the old link stops working at once. */
  revoke(eventId: number): Promise<void>;
}
