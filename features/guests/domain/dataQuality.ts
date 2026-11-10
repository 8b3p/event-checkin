import { normalizeAr } from "@/shared/lib/normalize-ar";
import { phoneKey } from "@/shared/lib/phone";
import type { GuestSource } from "./Guest";

/** What the cleanup view needs of a guest — satisfied by a check-in `GuestAttendanceRow`. */
export type CleanupGuest = {
  id: number;
  name: string;
  seats: number;
  phone: string | null;
  note: string | null;
  source: GuestSource;
  insideSeats: number;
  firstInAt: Date | null;
  lastOutAt: Date | null;
};

export type MatchReason = "name" | "phone";

export type DuplicateGroup = { guests: CleanupGuest[]; reasons: MatchReason[] };

export type WalkInMatch = {
  walkIn: CleanupGuest;
  /** Invited guests the walk-in probably is, best (most reasons) first. */
  matches: { guest: CleanupGuest; reasons: MatchReason[] }[];
};

export type DataQualityReport = {
  /** Checked in but not (fully) checked out — the out-data is incomplete for these. */
  stillInside: CleanupGuest[];
  /** Same normalised name or phone among guests of the same kind (invited/invited, walk-in/walk-in). */
  duplicates: DuplicateGroup[];
  /** Walk-ins that probably are an invited guest. */
  walkInMatches: WalkInMatch[];
};

/** Arabic-folded, punctuation-free, single-spaced — so "أحمد  علي" and "احمد علي." compare equal. */
export function nameKey(name: string): string {
  return normalizeAr(name)
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function matchReasons(a: CleanupGuest, b: CleanupGuest): MatchReason[] {
  const reasons: MatchReason[] = [];
  const nameA = nameKey(a.name);
  if (nameA !== "" && nameA === nameKey(b.name)) reasons.push("name");
  const phoneA = phoneKey(a.phone);
  if (phoneA !== "" && phoneA === phoneKey(b.phone)) reasons.push("phone");
  return reasons;
}

function findDuplicateGroups(guests: CleanupGuest[]): DuplicateGroup[] {
  // Union-find, so A≈B and B≈C by different keys still come out as one group.
  const parent = new Map<number, number>(guests.map((guest) => [guest.id, guest.id]));
  const find = (id: number): number => {
    const up = parent.get(id)!;
    if (up === id) return id;
    const root = find(up);
    parent.set(id, root);
    return root;
  };

  const pairs: { a: CleanupGuest; reasons: MatchReason[] }[] = [];

  for (let i = 0; i < guests.length; i++) {
    for (let j = i + 1; j < guests.length; j++) {
      // An invited guest and a walk-in that look alike are the walk-in match, reported separately.
      if (guests[i].source !== guests[j].source) continue;
      const reasons = matchReasons(guests[i], guests[j]);
      if (reasons.length === 0) continue;
      parent.set(find(guests[i].id), find(guests[j].id));
      pairs.push({ a: guests[i], reasons });
    }
  }

  const reasonsByRoot = new Map<number, Set<MatchReason>>();
  for (const pair of pairs) {
    const root = find(pair.a.id);
    const set = reasonsByRoot.get(root) ?? new Set<MatchReason>();
    for (const reason of pair.reasons) set.add(reason);
    reasonsByRoot.set(root, set);
  }

  const members = new Map<number, CleanupGuest[]>();
  for (const guest of guests) {
    const root = find(guest.id);
    if (!reasonsByRoot.has(root)) continue;
    members.set(root, [...(members.get(root) ?? []), guest]);
  }

  return [...members.entries()].map(([root, group]) => ({
    guests: group,
    reasons: (["name", "phone"] as MatchReason[]).filter((reason) => reasonsByRoot.get(root)!.has(reason)),
  }));
}

function findWalkInMatches(guests: CleanupGuest[]): WalkInMatch[] {
  const invited = guests.filter((guest) => guest.source === "invited");
  const matches: WalkInMatch[] = [];

  for (const walkIn of guests.filter((guest) => guest.source === "walk_in")) {
    const found = invited
      .map((guest) => ({ guest, reasons: matchReasons(walkIn, guest) }))
      .filter((match) => match.reasons.length > 0)
      .sort((a, b) => b.reasons.length - a.reasons.length || a.guest.id - b.guest.id);
    if (found.length > 0) matches.push({ walkIn, matches: found });
  }

  return matches;
}

export function findDataQualityIssues(guests: CleanupGuest[]): DataQualityReport {
  return {
    stillInside: guests.filter((guest) => guest.insideSeats > 0),
    duplicates: findDuplicateGroups(guests),
    walkInMatches: findWalkInMatches(guests),
  };
}

export type MergePick = "keep" | "merge";

export type MergeFieldPicks = { phone: MergePick; note: MergePick };

/**
 * Of two guests, which to keep: the invited one (its QR is the one already
 * handed out), otherwise the older.
 */
export function suggestKeepAndMerge(a: CleanupGuest, b: CleanupGuest): { keep: CleanupGuest; merge: CleanupGuest } {
  const rank = (guest: CleanupGuest) => (guest.source === "invited" ? 0 : 1);
  const [keep, merge] = [a, b].sort((x, y) => rank(x) - rank(y) || x.id - y.id);
  return { keep, merge };
}

/** Keep the surviving guest's phone/note unless it's empty and the other has one. */
export function defaultMergePicks(
  keep: Pick<CleanupGuest, "phone" | "note">,
  merge: Pick<CleanupGuest, "phone" | "note">,
): MergeFieldPicks {
  const empty = (value: string | null) => !value || value.trim() === "";
  return {
    phone: empty(keep.phone) && !empty(merge.phone) ? "merge" : "keep",
    note: empty(keep.note) && !empty(merge.note) ? "merge" : "keep",
  };
}
