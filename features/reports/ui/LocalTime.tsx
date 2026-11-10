"use client";

const TIME = new Intl.DateTimeFormat("ar-u-nu-latn", { hour: "2-digit", minute: "2-digit" });

/**
 * A scan time in the viewer's own timezone. The server renders in its own
 * zone (UTC on most hosts), so the first paint can differ from the browser's
 * — suppressHydrationWarning lets the client value win without a warning.
 */
export default function LocalTime({ value }: { value: Date | string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const date = typeof value === "string" ? new Date(value) : value;

  return (
    <time dateTime={date.toISOString()} className="tabular" suppressHydrationWarning>
      {TIME.format(date)}
    </time>
  );
}
