import { generateCodes } from "@/shared/lib/codes";
import type { IGuestRepository } from "../IGuestRepository";

const MAX_LINES = 2000;
const MAX_SEATS = 50;

export type ImportGuestsResult = { created: number };

function parseSeats(raw: string | undefined): number {
  const seats = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(seats) || seats < 1) return 1;
  return Math.min(seats, MAX_SEATS);
}

/**
 * Parses one invitation per line as `name, seats, note` (tabs work too, for
 * a column pasted from a spreadsheet), generates a unique code for each,
 * and inserts them all in one batch.
 */
export class ImportGuestsUseCase {
  constructor(private readonly guestRepository: IGuestRepository) {}

  async execute(eventId: number, raw: string): Promise<ImportGuestsResult> {
    const lines = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) throw new Error("الصق اسماً واحداً على الأقل.");
    if (lines.length > MAX_LINES) {
      throw new Error(`هذا أكثر من ${MAX_LINES} سطر — قسّمها على عدة مرات.`);
    }

    const parsed = lines.map((line) => {
      const [name, seats, note] = line.split(/\t|[,،]/).map((part) => part?.trim());
      return { name, seats, note };
    });

    const bad = parsed.find((row) => !row.name);
    if (bad) throw new Error("أحد الأسطر لا يحتوي على اسم.");

    const codes = generateCodes(parsed.length);
    const created = await this.guestRepository.createMany(
      eventId,
      parsed.map((row, index) => ({
        name: row.name!,
        seats: parseSeats(row.seats),
        phone: null,
        note: row.note || null,
        code: codes[index],
      })),
    );

    return { created };
  }
}
