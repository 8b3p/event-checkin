export type GuestSource = "invited" | "walk_in";

export type Guest = {
  id: number;
  eventId: number;
  name: string;
  seats: number;
  phone: string | null;
  note: string | null;
  code: string;
  source: GuestSource;
  createdAt: Date;
};

/** Low-level shape the repository persists — code/source are explicit here since a
 * repository is source-agnostic; the CreateGuestUseCase (below) decides them for
 * the common "owner adds an invited guest" path. */
export type CreateGuestInput = {
  eventId: number;
  name: string;
  seats: number;
  phone: string | null;
  note: string | null;
  code: string;
  source: GuestSource;
};

export type UpdateGuestInput = {
  name: string;
  seats: number;
  phone: string | null;
  note: string | null;
};

export type BulkGuestRow = {
  name: string;
  seats: number;
  phone: string | null;
  note: string | null;
  code: string;
};
