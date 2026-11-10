export const MIN_RATING = 1;
export const MAX_RATING = 5;
export const MAX_COMMENT_LENGTH = 1000;

export type GuestFeedback = {
  id: number;
  guestId: number;
  rating: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** What the repository persists: already validated and trimmed by the use-case. */
export type SaveFeedbackInput = {
  guestId: number;
  rating: number;
  comment: string | null;
};

/** One row of the owner's feedback list: the answer plus who gave it. */
export type EventFeedbackItem = {
  guestId: number;
  guestName: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
};
