"use server";

import { AddWalkInGuestUseCase } from "@/features/check-in/domain/use-cases/AddWalkInGuestUseCase";
import { makeScanRepository } from "@/features/check-in/infrastructure/factory";
import { makeGuestRepository } from "@/features/guests/infrastructure/factory";
import { requireDoor } from "@/shared/lib/guard";

export type WalkInGuest = {
  id: number;
  name: string;
  seats: number;
  phone: string | null;
  note: string | null;
  code: string;
  source: "invited" | "walk_in";
  insideSeats: number;
};

export type WalkInFormState = { error?: string; guest?: WalkInGuest };

const MAX_SEATS = 50;

function parseSeats(raw: string): number {
  const seats = Number.parseInt(raw, 10);
  if (!Number.isFinite(seats) || seats < 1) return 1;
  return Math.min(seats, MAX_SEATS);
}

export async function addWalkInAction(_prev: WalkInFormState, formData: FormData): Promise<WalkInFormState> {
  const eventId = await requireDoor();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "أضف اسم الضيف." };

  const seats = parseSeats(String(formData.get("seats") ?? "1"));

  const { guest, insideSeats } = await new AddWalkInGuestUseCase(makeGuestRepository(), makeScanRepository()).execute({
    eventId,
    name,
    seats,
    scannedBy: "door",
  });

  return {
    guest: {
      id: guest.id,
      name: guest.name,
      seats: guest.seats,
      phone: guest.phone,
      note: guest.note,
      code: guest.code,
      source: guest.source,
      insideSeats,
    },
  };
}
