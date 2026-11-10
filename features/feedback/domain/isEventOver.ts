const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The one rule for "the event is over, guests may leave feedback": the owner
 * archived it, or its date (`YYYY-MM-DD`, optional) is strictly before today.
 *
 * "Today" is the UTC calendar date. This app's events are east of UTC, so this
 * errs on the side of opening feedback a few hours late, never early. A missing
 * or malformed date never counts as over on its own.
 */
export function isEventOver(event: { status: string; eventDate: string | null }, now: Date = new Date()): boolean {
  if (event.status === "archived") return true;
  if (!event.eventDate || !ISO_DATE.test(event.eventDate)) return false;
  const today = now.toISOString().slice(0, 10);
  return event.eventDate < today;
}
