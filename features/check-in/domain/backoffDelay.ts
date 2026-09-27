const BASE_MS = 2000;
const CEILING_MS = 60_000;

/**
 * Capped exponential backoff for the offline sync loop: 2s, 4s, 8s, …
 * up to a 60s ceiling. `attempt` is 1 for the first retry after an
 * initial failure. See spec §6.6.
 */
export function nextBackoffDelayMs(attempt: number): number {
  if (attempt < 1) return BASE_MS;
  return Math.min(BASE_MS * 2 ** (attempt - 1), CEILING_MS);
}
