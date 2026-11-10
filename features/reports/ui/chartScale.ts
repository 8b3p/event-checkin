/** Rounds the axis top up to something a reader can divide in their head. */
export function niceCeiling(value: number): number {
  if (value <= 5) return 5;
  if (value <= 10) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / (magnitude / 2)) * (magnitude / 2);
}
