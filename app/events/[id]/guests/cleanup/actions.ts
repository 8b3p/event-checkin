"use server";

import { revalidatePath } from "next/cache";
import type { MergePick } from "@/features/guests/domain/dataQuality";
import { MergeGuestsUseCase } from "@/features/guests/domain/use-cases/MergeGuestsUseCase";
import { makeGuestRepository } from "@/features/guests/infrastructure/factory";
import { requireOwner } from "@/shared/lib/guard";
import { pluralizeAr } from "@/shared/lib/pluralize-ar";

export type MergeGuestsFormState = { error?: string; ok?: string };

function parsePick(raw: FormDataEntryValue | null): MergePick | null {
  return raw === "keep" || raw === "merge" ? raw : null;
}

export async function mergeGuestsAction(
  _prev: MergeGuestsFormState,
  formData: FormData,
): Promise<MergeGuestsFormState> {
  await requireOwner();

  const eventId = Number(formData.get("eventId"));
  const keepId = Number(formData.get("keepId"));
  const mergeId = Number(formData.get("mergeId"));
  const phone = parsePick(formData.get("phone"));
  const note = parsePick(formData.get("note"));
  if (![eventId, keepId, mergeId].every(Number.isInteger) || !phone || !note) {
    return { error: "تعذّر فهم طلب الدمج." };
  }

  let moved: number;
  try {
    ({ movedScans: moved } = await new MergeGuestsUseCase(makeGuestRepository()).execute({
      eventId,
      keepId,
      mergeId,
      picks: { phone, note },
    }));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "حدث خطأ غير متوقع." };
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/guests`, "layout");
  return {
    ok: `تم الدمج ونُقل ${pluralizeAr(moved, { one: "سجل مسح واحد", two: "سجلا مسح", few: "سجلات مسح", many: "سجل مسح" })}.`,
  };
}
