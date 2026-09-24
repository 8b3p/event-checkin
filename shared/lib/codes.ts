import { randomBytes } from "node:crypto";

export { inviteUrl } from "./invite-url";

/**
 * Alphabet with the characters people misread removed (0/O, 1/I/L).
 * Codes end up in QR images but also get read aloud at the door when a
 * phone screen is too cracked or too dim to scan.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 10;
const DOOR_CODE_LENGTH = 5;

export function generateCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

/** Generates `count` codes that are unique within the batch. */
export function generateCodes(count: number): string[] {
  const codes = new Set<string>();
  while (codes.size < count) codes.add(generateCode());
  return [...codes];
}

/** Shorter than a guest code — a human types this once to start a shift, not per guest. */
export function generateDoorCode(): string {
  const bytes = randomBytes(DOOR_CODE_LENGTH);
  let code = "";
  for (let i = 0; i < DOOR_CODE_LENGTH; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

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
