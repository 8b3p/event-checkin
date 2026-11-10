import { randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 24; // 192 bits
/** base64url of 24 bytes: 32 characters, no padding. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

/** An unguessable, URL-safe token for a read-only link. */
export function generateShareToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Cheap shape check so junk never reaches the database. */
export function isWellFormedShareToken(candidate: string): boolean {
  return TOKEN_PATTERN.test(candidate);
}

/** Constant-time comparison, so a stored token can't be guessed a character at a time. */
export function shareTokensMatch(stored: string, candidate: string): boolean {
  const a = Buffer.from(stored);
  const b = Buffer.from(candidate);
  return a.length === b.length && timingSafeEqual(a, b);
}
