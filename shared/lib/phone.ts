import { normalizeAr } from "./normalize-ar";

/** How many trailing digits identify a subscriber regardless of country code / trunk prefix. */
const MATCH_DIGITS = 9;

/** Digits only (Arabic-Indic folded to Western), without a leading international `00`. */
export function phoneDigits(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = normalizeAr(phone).replace(/\D/g, "");
  return digits.startsWith("00") ? digits.slice(2) : digits;
}

/**
 * A key two phone strings share when they're the same number written
 * differently (`0501234567`, `+971 50 123 4567`, `٠٥٠١٢٣٤٥٦٧`). Compares the
 * trailing digits, so a missing or present country code doesn't matter.
 * Returns "" for anything too short to be a real number.
 */
export function phoneKey(phone: string | null | undefined): string {
  const digits = phoneDigits(phone);
  if (digits.length < 7) return "";
  return digits.length > MATCH_DIGITS ? digits.slice(-MATCH_DIGITS) : digits;
}

/** A `wa.me` link with a pre-filled message, or null when there is no usable number. */
export function whatsappUrl(phone: string | null | undefined, message: string): string | null {
  const digits = phoneDigits(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
