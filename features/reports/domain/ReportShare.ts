/** The state of an event's read-only report link. */
export type ReportShare = {
  token: string;
  sharedAt: Date;
  /** Whether the shared report names guests. */
  showNames: boolean;
};
