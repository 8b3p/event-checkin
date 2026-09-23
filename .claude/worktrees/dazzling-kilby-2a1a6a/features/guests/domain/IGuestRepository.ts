import type { BulkGuestRow, CreateGuestInput, Guest, UpdateGuestInput } from "./Guest";

export interface IGuestRepository {
  listForEvent(eventId: number): Promise<Guest[]>;
  getById(eventId: number, id: number): Promise<Guest | null>;
  getByCode(code: string): Promise<Guest | null>;
  create(input: CreateGuestInput): Promise<Guest>;
  createMany(eventId: number, rows: BulkGuestRow[]): Promise<number>;
  update(eventId: number, id: number, input: UpdateGuestInput): Promise<void>;
  delete(eventId: number, id: number): Promise<void>;
}
