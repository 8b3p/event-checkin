import { phoneDigits } from "@/shared/lib/phone";
import type { GuestSource } from "./Guest";

export type FollowUpFilter = "attended" | "partial" | "no_show" | "walk_in";

export const FOLLOW_UP_FILTERS: FollowUpFilter[] = ["attended", "partial", "no_show", "walk_in"];

/** What a follow-up list needs of a guest — satisfied by a check-in `GuestAttendanceRow`. */
export type FollowUpGuest = {
  id: number;
  name: string;
  seats: number;
  phone: string | null;
  source: GuestSource;
  status: "full" | "partial" | "no_show";
  peakInsideSeats: number;
};

/**
 * Which follow-up list a guest belongs to. The lists don't overlap, so their
 * counts add up: walk-ins are their own list, and the rest of the guests split
 * by how much of their party ever came — "ever", not "still inside", so
 * someone who has already left still counts as having attended.
 */
export function followUpFilterOf(guest: Pick<FollowUpGuest, "source" | "status">): FollowUpFilter {
  if (guest.source === "walk_in") return "walk_in";
  if (guest.status === "full") return "attended";
  if (guest.status === "partial") return "partial";
  return "no_show";
}

export function filterByFollowUp<T extends FollowUpGuest>(guests: T[], filter: FollowUpFilter): T[] {
  return guests.filter((guest) => followUpFilterOf(guest) === filter);
}

export function countByFollowUp(guests: FollowUpGuest[]): Record<FollowUpFilter, number> {
  const counts: Record<FollowUpFilter, number> = { attended: 0, partial: 0, no_show: 0, walk_in: 0 };
  for (const guest of guests) counts[followUpFilterOf(guest)] += 1;
  return counts;
}

export function hasPhone(guest: Pick<FollowUpGuest, "phone">): boolean {
  return phoneDigits(guest.phone) !== "";
}

export function countWithoutPhone(guests: Pick<FollowUpGuest, "phone">[]): number {
  return guests.filter((guest) => !hasPhone(guest)).length;
}

/** One number per line, deduplicated (a couple sharing a phone is listed once). */
export function phoneNumbersOf(guests: Pick<FollowUpGuest, "phone">[]): string[] {
  const seen = new Set<string>();
  const numbers: string[] = [];
  for (const guest of guests) {
    const digits = phoneDigits(guest.phone);
    if (!digits || seen.has(digits)) continue;
    seen.add(digits);
    numbers.push(guest.phone!.trim());
  }
  return numbers;
}

export type TemplateKind = "thanks" | "missed";

export const DEFAULT_TEMPLATES: Record<TemplateKind, string> = {
  thanks: "{name}، شكراً لحضوركم وتشريفكم لنا. وجودكم أسعدنا وأكمل فرحتنا.",
  missed: "{name}، افتقدناكم في المناسبة وكنا نتمنى حضوركم. نسأل الله أن يجمعنا في مناسبة قريبة.",
};

/** The attendee template covers everyone who came (fully, partly, or as a walk-in); only a no-show gets "we missed you". */
export function templateKindFor(filter: FollowUpFilter): TemplateKind {
  return filter === "no_show" ? "missed" : "thanks";
}

/** Fills every `{name}` in a template. */
export function fillTemplate(template: string, name: string): string {
  return template.replaceAll("{name}", name.trim());
}
