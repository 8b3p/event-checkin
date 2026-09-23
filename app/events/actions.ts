"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CreateEventUseCase } from "@/features/events/domain/use-cases/CreateEventUseCase";
import { UpdateEventUseCase } from "@/features/events/domain/use-cases/UpdateEventUseCase";
import { ArchiveEventUseCase } from "@/features/events/domain/use-cases/ArchiveEventUseCase";
import { DuplicateEventUseCase } from "@/features/events/domain/use-cases/DuplicateEventUseCase";
import { makeEventRepository } from "@/features/events/infrastructure/factory";
import { requireOwner } from "@/shared/lib/guard";
import { generateDoorCode } from "@/shared/lib/codes";

export type EventFormState = { error?: string; ok?: string };

function parseCapacity(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number.parseInt(trimmed, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function readEventInput(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    eventDate: String(formData.get("eventDate") ?? "").trim() || null,
    venue: String(formData.get("venue") ?? "").trim() || null,
    description: String(formData.get("description") ?? "").trim() || null,
    doorCode: String(formData.get("doorCode") ?? ""),
    capacity: parseCapacity(String(formData.get("capacity") ?? "")),
  };
}

export async function createEventAction(_prev: EventFormState, formData: FormData): Promise<EventFormState> {
  await requireOwner();

  let eventId: number;
  try {
    const event = await new CreateEventUseCase(makeEventRepository()).execute(readEventInput(formData));
    eventId = event.id;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "حدث خطأ غير متوقع." };
  }

  revalidatePath("/");
  redirect(`/events/${eventId}`);
}

export async function updateEventAction(_prev: EventFormState, formData: FormData): Promise<EventFormState> {
  await requireOwner();

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { error: "لم يتم العثور على الفعالية." };

  try {
    await new UpdateEventUseCase(makeEventRepository()).execute(id, readEventInput(formData));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "حدث خطأ غير متوقع." };
  }

  revalidatePath("/");
  revalidatePath(`/events/${id}`);
  return { ok: "تم الحفظ." };
}

export async function archiveEventAction(formData: FormData): Promise<void> {
  await requireOwner();

  const id = Number(formData.get("id"));
  if (Number.isInteger(id)) await new ArchiveEventUseCase(makeEventRepository()).execute(id);

  revalidatePath("/");
  redirect("/");
}

export async function duplicateEventAction(formData: FormData): Promise<void> {
  await requireOwner();

  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) redirect("/");

  try {
    const copy = await new DuplicateEventUseCase(makeEventRepository()).execute(id, generateDoorCode());
    revalidatePath("/");
    redirect(`/events/${copy.id}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) throw error;
    revalidatePath("/");
    redirect("/");
  }
}
