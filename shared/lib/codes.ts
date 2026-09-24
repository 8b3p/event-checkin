import { randomBytes } from "node:crypto";
import { ALPHABET, CODE_LENGTH } from "./code-format";

export { inviteUrl } from "./invite-url";
export { normaliseScan } from "./code-format";

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
