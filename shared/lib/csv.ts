const DANGEROUS_PREFIX = /^[=+\-@\t\r]/;

/** Quotes a field and defuses spreadsheet formula injection (a leading = + - @). */
export function csvField(value: string): string {
  const safe = DANGEROUS_PREFIX.test(value) ? `'${value}` : value;
  if (/[",\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\n");
}

/**
 * A CSV download. The UTF-8 BOM makes Excel (still the most common opener)
 * detect Arabic text as UTF-8 instead of guessing a local codepage.
 *
 * HTTP header values must be Latin-1/ByteString — an Arabic filename can't go
 * in `filename=` directly (Response throws "Cannot convert argument to a
 * ByteString"). RFC 5987's `filename*=UTF-8''<percent-encoded>` carries the
 * real name; the ASCII `filename=` fallback covers clients that ignore it.
 */
export function csvResponse(rows: string[][], asciiFilename: string, filename: string): Response {
  return new Response("﻿" + toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
