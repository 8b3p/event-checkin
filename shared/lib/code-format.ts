/**
 * The shape of a guest code — split out from `codes.ts` (which imports
 * `node:crypto` for generation) so the scanner's client bundle can validate a
 * decoded QR's shape without pulling `node:crypto` into the browser. See
 * `invite-url.ts` for the same split applied to `inviteUrl`.
 */

/**
 * Alphabet with the characters people misread removed (0/O, 1/I/L).
 * Codes end up in QR images but also get read aloud at the door when a
 * phone screen is too cracked or too dim to scan.
 */
export const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 10;

/**
 * The door scanner may read a full invite URL, a bare code, or a code a
 * staff member typed in lowercase. Reduce all of those to the stored form.
 */
export function normaliseScan(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;

  const fromUrl = text.match(/\/i\/([A-Za-z0-9]+)/);
  const candidate = (fromUrl ? fromUrl[1] : text).toUpperCase();

  if (candidate.length !== CODE_LENGTH) return null;
  if (![...candidate].every((char) => ALPHABET.includes(char))) return null;

  return candidate;
}
