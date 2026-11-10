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

/** The country guests' local numbers belong to: Syria. Local mobiles are written 09XX XXX XXX. */
const DEFAULT_COUNTRY_CODE = "963";
/** A Syrian mobile without its trunk 0: 9 digits starting with 9. */
const LOCAL_MOBILE_WITHOUT_TRUNK = /^9\d{8}$/;

/**
 * The number in the international form wa.me needs (country code, no `+`, no
 * trunk 0). A local `09…` number, or one typed without its leading 0, is taken
 * to be Syrian; anything already written with a country code is left alone.
 */
export function internationalDigits(phone: string | null | undefined): string {
  const digits = phoneDigits(phone);
  if (!digits) return "";
  if (digits.startsWith("0")) return DEFAULT_COUNTRY_CODE + digits.slice(1);
  if (LOCAL_MOBILE_WITHOUT_TRUNK.test(digits)) return DEFAULT_COUNTRY_CODE + digits;
  return digits;
}

/** A `wa.me` link with a pre-filled message, or null when there is no usable number. */
export function whatsappUrl(phone: string | null | undefined, message: string): string | null {
  const digits = internationalDigits(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
