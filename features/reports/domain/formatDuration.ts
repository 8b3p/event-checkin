import { pluralizeAr } from "@/shared/lib/pluralize-ar";

const hours = (n: number) => pluralizeAr(n, { one: "ساعة واحدة", two: "ساعتان", few: "ساعات", many: "ساعة" });
const minutes = (n: number) => pluralizeAr(n, { one: "دقيقة واحدة", two: "دقيقتان", few: "دقائق", many: "دقيقة" });

/** "ساعتان و٥ دقائق"-style length for a stay or an overrun, rounded to the nearest minute. */
export function formatDuration(totalMinutes: number): string {
  const rounded = Math.round(totalMinutes);
  if (rounded < 1) return "أقل من دقيقة";

  const wholeHours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (wholeHours === 0) return minutes(rest);
  if (rest === 0) return hours(wholeHours);
  const tail = minutes(rest);
  // The conjunction fuses with a leading digit ("و5") and reads as a stray letter, so give it a space there.
  return `${hours(wholeHours)} ${/^\d/.test(tail) ? "و " : "و"}${tail}`;
}
