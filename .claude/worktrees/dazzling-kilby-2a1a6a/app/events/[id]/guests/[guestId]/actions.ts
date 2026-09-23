"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { DeleteGuestUseCase } from "@/features/guests/domain/use-cases/DeleteGuestUseCase";
import { UpdateGuestUseCase } from "@/features/guests/domain/use-cases/UpdateGuestUseCase";
import { makeGuestRepository } from "@/features/guests/infrastructure/factory";
import { requireOwner } from "@/shared/lib/guard";

export type EditGuestFormState = { error?: string; ok?: string };

const MAX_SEATS = 50;

function parseSeats(raw: string): number {
  const seats = Number.parseInt(raw, 10);
  if (!Number.isFinite(seats) || seats < 1) return 1;
  return Math.min(seats, MAX_SEATS);
}

export async function updateGuestAction(
  _prev: EditGuestFormState,
  formData: FormData,
): Promise<EditGuestFormState> {
  await requireOwner();

  const eventId = Number(formData.get("eventId"));
  const id = Number(formData.get("id"));
  if (!Number.isInteger(eventId) || !Number.isInteger(id)) return { error: "لم يتم العثور على الدعوة." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "أضف اسماً للدعوة." };

  try {
    await new UpdateGuestUseCase(makeGuestRepository()).execute(eventId, id, {
      name,
      seats: parseSeats(String(formData.get("seats") ?? "1")),
      phone: String(formData.get("phone") ?? "").trim() || null,
      note: String(formData.get("note") ?? "").trim() || null,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "حدث خطأ غير متوقع." };
  }

  revalidatePath(`/events/${eventId}/guests`);
  revalidatePath(`/events/${eventId}/guests/${id}`);
  return { ok: "تم الحفظ." };
}

export async function deleteGuestAction(formData: FormData): Promise<void> {
  await requireOwner();

  const eventId = Number(formData.get("eventId"));
  const id = Number(formData.get("id"));

  if (!Number.isInteger(eventId)) {
    redirect("/");
  }

  if (Number.isInteger(id)) {
    try {
      await new DeleteGuestUseCase(makeGuestRepository()).execute(eventId, id);
    } catch {
      // Fail safe: degrade to a no-op redirect instead of an unhandled error page.
    }
  }

  revalidatePath(`/events/${eventId}/guests`);
  redirect(`/events/${eventId}/guests`);
}
